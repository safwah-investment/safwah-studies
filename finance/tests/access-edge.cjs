const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../functions/finance-access/handler.js'), 'utf8');
const OWNER = 'afalsuhaimi@gmail.com';
const ORIGIN = 'https://safwah-investment.github.io';
const REQUEST_ID = 'b931f9ac-7031-4b84-8c95-5df7858ce865';

(async () => {
  const { createFinanceAccessHandler, allowedOrigin, corsHeaders } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );

  function setup({ configured = false, rows = [], userError = null, mailOk = true, mailThrow = false, completeError = null } = {}) {
    const userCalls = [], adminCalls = [], mailCalls = [], tasks = [];
    const handler = createFinanceAccessHandler({
      env: key => configured ? ({ RESEND_API_KEY: 'mock-provider-key', SAFWAH_MAIL_FROM: 'finance@example.com' }[key]) : undefined,
      waitUntil: task => tasks.push(task),
      fetchMail: async (url, options) => {
        mailCalls.push({ url, options });
        if (mailThrow) throw Error('mock provider outage');
        return { ok: mailOk };
      },
    });
    const ctx = {
      authMode: 'publishable',
      supabase: { rpc: async (name, parameters) => {
        userCalls.push({ name, parameters });
        return { error: userError, data: name === 'request_finance_access' ? { accepted: true } : { status: 'approved', access_role: 'viewer', email_verified: false } };
      } },
      supabaseAdmin: { rpc: async (name, parameters) => {
        adminCalls.push({ name, parameters });
        return { error: name === 'complete_finance_access_notification' ? completeError : null, data: name === 'claim_finance_access_notifications' ? rows : true };
      } },
    };
    return { handler, ctx, userCalls, adminCalls, mailCalls, drain: () => Promise.all(tasks) };
  }
  const request = body => new Request('https://project.supabase.co/functions/v1/finance-access', {
    method: 'POST', headers: { origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  assert.equal(allowedOrigin(ORIGIN), true);
  assert.equal(allowedOrigin(null), true);
  assert.equal(allowedOrigin('https://attacker.example'), false);
  assert.equal(corsHeaders(ORIGIN)['Access-Control-Allow-Origin'], ORIGIN);

  // Without provider configuration, the request is persisted but the outbox is never claimed.
  let s = setup();
  let response = await s.handler(request({ action: 'request', email: 'applicant@example.com', to: 'attacker@example.com', redirect: 'https://attacker.example' }), s.ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.deepEqual(s.userCalls, [{ name: 'request_finance_access', parameters: { email: 'applicant@example.com' } }]);
  await s.drain();
  assert.equal(s.adminCalls.length, 0);
  assert.equal(s.mailCalls.length, 0);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  // A public/publishable caller never reaches the owner decision RPC.
  response = await s.handler(request({ action: 'decide', requestId: REQUEST_ID, approve: true }), s.ctx);
  assert.equal(response.status, 401);
  assert.equal(s.userCalls.length, 1);
  assert.equal(s.adminCalls.length, 0);

  // A signed-in non-owner is rejected by the trusted RPC; provider delivery is not started.
  s = setup({ configured: true, userError: { message: 'ACCESS_DENIED' } });
  s.ctx.authMode = 'user';
  response = await s.handler(request({ action: 'decide', requestId: REQUEST_ID, approve: true, role: 'editor', email: 'attacker@example.com' }), s.ctx);
  assert.equal(response.status, 403);
  assert.deepEqual(s.userCalls[0], { name: 'decide_finance_access_request', parameters: { request_id: REQUEST_ID, approve: true, desired_role: 'editor' } });
  await s.drain();
  assert.equal(s.adminCalls.length, 0);
  assert.equal(s.mailCalls.length, 0);

  // Owner decision defaults to viewer, and passes neither caller-supplied recipient nor redirect.
  s = setup();
  s.ctx.authMode = 'user';
  response = await s.handler(request({ action: 'decide', requestId: REQUEST_ID, approve: true, to: 'attacker@example.com', redirect: 'https://attacker.example' }), s.ctx);
  assert.equal(response.status, 200);
  assert.equal(s.userCalls[0].parameters.desired_role, 'viewer');
  assert.deepEqual(await response.json(), { status: 'approved', access_role: 'viewer', email_verified: false });
  await s.drain();
  assert.equal(s.adminCalls.length, 0);

  // Health and the explicit worker are not public endpoints.
  s = setup({ configured: true });
  for (const action of ['health', 'deliver']) {
    response = await s.handler(request({ action }), s.ctx);
    assert.equal(response.status, 401);
  }
  assert.equal(s.adminCalls.length, 0);
  s.ctx.authMode = 'user';
  s.ctx.supabase.rpc = async () => ({ error: { message: 'ACCESS_DENIED' } });
  response = await s.handler(request({ action: 'health' }), s.ctx);
  assert.equal(response.status, 403);

  // Delivery recipients come only from the fixed owner address and server-owned outbox.
  const rows = [
    { id: 'notification-request', kind: 'request', email: 'applicant@example.com', request_id: REQUEST_ID, access_role: null },
    { id: 'notification-approved', kind: 'approved', email: 'approved@example.com', request_id: REQUEST_ID, access_role: 'viewer' },
    { id: 'notification-rejected', kind: 'rejected', email: 'rejected@example.com', request_id: REQUEST_ID, access_role: null },
  ];
  s = setup({ configured: true, rows });
  response = await s.handler(request({ action: 'request', email: 'applicant@example.com', to: 'attacker@example.com', from: 'spoof@example.com', redirect: 'https://attacker.example' }), s.ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  await s.drain();
  assert.equal(s.mailCalls.length, 3);
  assert.deepEqual(s.mailCalls.map(call => JSON.parse(call.options.body).to), [[OWNER], ['approved@example.com'], ['rejected@example.com']]);
  assert.ok(s.mailCalls.every(call => call.url === 'https://api.resend.com/emails'));
  assert.ok(s.mailCalls.every(call => JSON.parse(call.options.body).from === 'finance@example.com'));
  assert.ok(s.mailCalls.every(call => !call.options.body.includes('attacker.example')));
  assert.equal(s.mailCalls[0].options.headers['Idempotency-Key'], 'safwah-access-notification-request');
  assert.match(JSON.parse(s.mailCalls[0].options.body).text, /\?review=b931f9ac-7031-4b84-8c95-5df7858ce865/);
  assert.ok(s.adminCalls.filter(call => call.name === 'complete_finance_access_notification').every(call => call.parameters.delivered === true));

  // HTTP/provider failure acknowledges failure only; it never modifies/deletes the access request.
  for (const mailThrow of [false, true]) {
    s = setup({ configured: true, rows: [rows[0]], mailOk: false, mailThrow });
    s.ctx.authMode = 'secret';
    response = await s.handler(request({ action: 'deliver' }), s.ctx);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { configured: true, delivered: 0 });
    assert.deepEqual(s.adminCalls[1], { name: 'complete_finance_access_notification', parameters: { notification_id: rows[0].id, delivered: false } });
    assert.deepEqual(s.adminCalls.map(call => call.name), ['claim_finance_access_notifications', 'complete_finance_access_notification']);
    assert.equal(s.userCalls.length, 0);
  }

  s = setup({ configured: true, rows: [rows[0]], completeError: { message: 'temporary DB failure' } });
  s.ctx.authMode = 'secret';
  response = await s.handler(request({ action: 'deliver' }), s.ctx);
  assert.equal(response.status, 503);
  assert.ok((await response.json()).message.includes('الطلبات محفوظة'));

  s = setup();
  response = await s.handler(request({ action: 'request', email: 'applicant@example.com', excess: 'x'.repeat(2048) }), s.ctx);
  assert.equal(response.status, 400);
  response = await s.handler(request([]), s.ctx);
  assert.equal(response.status, 400);
  assert.equal(s.userCalls.length, 0);

  console.log('PASS: missing provider never claims mail; public/non-owner decisions denied; viewer default and owner-only worker; fixed recipients and idempotency; provider failure preserves requests; invalid bodies rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
