const references=[{"sector": "industrial", "ar": "تقارير القطاعات الصناعية", "en": "Industrial sector reports", "publisher": "SIDF · الصندوق الصناعي", "kind": ["مكتبة تقارير", "Report library"], "desc": ["تقارير عن موضوعات صناعية مثل الألمنيوم والمكونات الصيدلانية والرقمنة وسلاسل الإمداد.", "Explore industrial topics including aluminium, pharmaceutical ingredients, digitalisation and supply chains."], "url": "https://sidf.gov.sa/ar/MediaCenter/Pages/Industrial-reports.aspx"}, {"sector": "industrial", "ar": "التقرير السنوي للصندوق الصناعي 2024", "en": "SIDF Annual Report 2024", "publisher": "SIDF · الصندوق الصناعي", "kind": ["تقرير سنوي · 2024", "Annual report · 2024"], "desc": ["مرجع لفهم نشاط الصندوق وتمويل التنمية الصناعية؛ ليس دراسة جدوى لمشروع محدد.", "Context on the fund and industrial development finance; not a project-specific feasibility study."], "url": "https://www.sidf.gov.sa/-/media/PDFs/Annual-Reports/Annual-Report-2024-ENG.pdf"}, {"sector": "commercial", "ar": "المنشآت الصغيرة والمتوسطة وآفاق التجارة الإلكترونية الواعدة", "en": "SMEs and the promising prospects of e-commerce", "publisher": "Monsha’at · منشآت", "kind": ["تعريف بتقرير · 2024", "Report overview · 2024"], "desc": ["صفحة منشآت التعريفية بالتقرير تتضمن رابط التقرير ومؤشرات عن سوق التجارة الإلكترونية.", "The publisher’s overview links to its report and presents e-commerce market indicators."], "url": "https://monshaat.gov.sa/ar/node/165478"}, {"sector": "commercial", "ar": "تقارير منشآت", "en": "Monsha’at reports", "publisher": "Monsha’at · منشآت", "kind": ["مكتبة تقارير", "Report library"], "desc": ["تقارير عن المنشآت الصغيرة والمتوسطة وريادة الأعمال وموضوعات تجارية.", "Research on SMEs, entrepreneurship and business sectors."], "url": "https://monshaat.gov.sa/ar/monshaat-reports"}, {"sector": "services", "ar": "الاستثمار السياحي في السعودية", "en": "Tourism investment in Saudi Arabia", "publisher": "Ministry of Tourism · وزارة السياحة", "kind": ["بوابة معلومات قطاعية", "Sector information portal"], "desc": ["مصدر رسمي لاستكشاف الاستثمار السياحي والضيافة والأدلة المتاحة.", "An official starting point for tourism and hospitality investment information and available guides."], "url": "https://mt.gov.sa/tourism-investment"}, {"sector": "services", "ar": "التقارير الاقتصادية والاستثمارية", "en": "Economic and investment reports", "publisher": "Invest Saudi · استثمر في السعودية", "kind": ["مكتبة تقارير", "Report library"], "desc": ["منشورات اقتصادية واستثمارية تساعد في تكوين صورة أولية عن السوق.", "Economic and investment publications to inform an initial market perspective."], "url": "https://investsaudi.sa/economics-investment-reports"}];
let lang='en',step=0;
const form=document.querySelector('#brief-form'),q=s=>document.querySelector(s),words=(ar,en)=>lang==='ar'?ar:en;
const sectors={industrial:['صناعي','Industrial'],commercial:['تجاري','Commercial'],services:['خدمي','Services']};
function library(){
 const term=q('#search').value.trim().toLocaleLowerCase(),sector=q('#filter').value;
 const matches=references.filter(r=>(sector==='all'||r.sector===sector)&&[r.ar,r.en,r.publisher,...r.desc].join(' ').toLocaleLowerCase().includes(term));
 q('#references').replaceChildren();
 for(const r of matches){const card=document.createElement('article');card.className='card';const badge=document.createElement('p');badge.className='eyebrow';badge.textContent=words(...r.kind);const title=document.createElement('h3');title.textContent=r[lang];const pub=document.createElement('p');pub.className='publisher';pub.textContent=r.publisher;const desc=document.createElement('p');desc.textContent=words(...r.desc);const link=document.createElement('a');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';link.className='text-link';link.textContent=words('زيارة المصدر الأصلي ↗','Open original source ↗');card.append(badge,title,pub,desc,link);q('#references').append(card);}
 q('#result-count').textContent=words(`${matches.length} مراجع متاحة`,`${matches.length} resources found`);q('#no-results').hidden=matches.length>0;
}
function brief(){const d=new FormData(form);return [words('طلب دراسة — صفوة الاستثمارية','Study enquiry — Safwah Investment'),...['sector','city','stage','objective','timing','name','email','company','country'].map(k=>{const el=form.querySelector(`[name="${k}"]`);const label=el.closest('label').querySelector('span').textContent;return `${label}: ${el.tagName==='SELECT'?el.selectedOptions[0].textContent:d.get(k)||'—'}`;})].join('\n\n');}
function showStep(){document.querySelectorAll('[data-step]').forEach(e=>{e.hidden=Number(e.dataset.step)!==step});q('#progress').textContent=words(`الخطوة ${step+1} من 4`,`Step ${step+1} of 4`);q('#back').hidden=step===0;q('#next').hidden=step===3;if(step===3)q('#summary').textContent=brief();q('#form-status').textContent='';}
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.querySelectorAll('[data-ar]').forEach(e=>e.textContent=e.dataset[lang]);q('#language').textContent=words('English','العربية');q('#language').setAttribute('aria-label',words('Switch to English','التبديل إلى العربية'));document.title=words('صفوة الاستثمارية | دراسات المستثمر','Safwah Investment | Investor Research');library();showStep();}
q('#language').addEventListener('click',()=>{lang=lang==='en'?'ar':'en';translate();});
q('#search').addEventListener('input',library);q('#filter').addEventListener('change',library);
q('#next').addEventListener('click',()=>{const fields=[...document.querySelector(`[data-step="${step}"]`).querySelectorAll('input,select,textarea')];if(fields.some(e=>!e.reportValidity()))return;step=Math.min(3,step+1);showStep();form.querySelector(`[data-step="${step}"] input,[data-step="${step}"] textarea`)?.focus();});
q('#back').addEventListener('click',()=>{step=Math.max(0,step-1);showStep();});form.addEventListener('submit',e=>e.preventDefault());
document.querySelectorAll('.sector-pick').forEach(b=>b.addEventListener('click',()=>{q('#study-sector').value=b.dataset.sector;step=0;showStep();q('#request').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});q('#study-sector').focus({preventScroll:true});}));
q('#email').addEventListener('click',()=>{location.href='mailto:Info@Safwah-group.com?subject='+encodeURIComponent(words('طلب دراسة استثمارية','Investment study enquiry'))+'&body='+encodeURIComponent(brief());q('#form-status').textContent=words('أكمل الإرسال في تطبيق البريد. إذا لم يفتح، انسخ الملخص وأرسله إلى بريد صفوة الاستثمارية.','Complete sending in your email app. If it does not open, copy your brief and email Safwah Investment.');});
q('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(brief());q('#form-status').textContent=words('تم نسخ الملخص. يمكنك إرساله إلى الفريق.','Brief copied. You can now share it with the team.');}catch{q('#form-status').textContent=words('تعذر النسخ. استخدم تنزيل الملخص أو حدد النص وانسخه.','Copy unavailable. Download the brief or select and copy its text.');}});
q('#download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['\ufeff'+brief()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='safwah-study-brief.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);q('#form-status').textContent=words('تم تجهيز الملخص للتنزيل؛ لم يُرسل إلى الفريق.','Brief prepared for download; it has not been sent to the team.');});
q('#whatsapp').addEventListener('click',()=>{const url='https://wa.me/966505189070?text='+encodeURIComponent(brief());window.open(url,'_blank','noopener,noreferrer');q('#form-status').textContent=words('تم فتح واتساب مع ملخص الطلب. راجع الرسالة ثم أرسلها.','WhatsApp opened with your brief. Review the message, then send it.');});
translate();

q('#motion-toggle').addEventListener('click',()=>{const paused=q('.hero').classList.toggle('paused');q('#motion-toggle').setAttribute('aria-pressed',String(paused));q('#motion-toggle').dataset.ar=paused?'تشغيل حركة الصور':'إيقاف حركة الصور';q('#motion-toggle').dataset.en=paused?'Resume slideshow':'Pause slideshow';q('#motion-toggle').textContent=q('#motion-toggle').dataset[lang];});


const navLinks=[...document.querySelectorAll('header nav a[href^="#"]')];
const navTargets=navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
navLinks.forEach(a=>a.addEventListener('click',()=>{navLinks.forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
if('IntersectionObserver' in window&&navTargets.length){
 const observer=new IntersectionObserver(entries=>{
  const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
  if(!visible)return;
  navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+visible.target.id));
 },{rootMargin:'-20% 0px -65% 0px',threshold:[0,.15,.35,.6]});
 navTargets.forEach(el=>observer.observe(el));
}
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
 const target=document.querySelector(a.getAttribute('href'));if(!target)return;
 e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 history.replaceState(null,'',a.getAttribute('href'));
}));


const navToggle=q('#nav-toggle'),siteNav=q('#site-nav');
if(navToggle&&siteNav){
 const closeNav=()=>{siteNav.classList.remove('open');navToggle.setAttribute('aria-expanded','false');};
 navToggle.addEventListener('click',()=>{const open=siteNav.classList.toggle('open');navToggle.setAttribute('aria-expanded',String(open));});
 siteNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeNav));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
 document.addEventListener('click',e=>{if(!siteNav.contains(e.target)&&e.target!==navToggle)closeNav();});
}
