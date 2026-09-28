const services=[
 ['investment','الدراسات الاستثمارية','Investment studies','تحليل الفرص والمشروعات والعوائد والمخاطر ومسارات الدخول والتخارج.','Analysis of opportunities, projects, returns, risks and entry and exit routes.'],
 ['feasibility','دراسات الجدوى','Feasibility studies','دراسات الجدوى وما قبل الجدوى وتحليل نموذج الأعمال والافتراضات المالية.','Feasibility and pre-feasibility studies, business models and financial assumptions.'],
 ['diligence','العناية الواجبة','Due diligence','مراجعة المعلومات والعقود والافتراضات والمخاطر قبل اتخاذ القرار.','Review of information, contracts, assumptions and risks before a decision.'],
 ['market','دراسات السوق','Market intelligence','تحليل الأسواق والطلب والمنافسة والقطاعات والفرص المستقبلية.','Research into markets, demand, competition, sectors and emerging opportunities.'],
 ['realestate','الدراسات العقارية','Real estate studies','تحليل التطوير والاستثمار العقاري والعوائد ونماذج الإيرادات.','Analysis of real estate development, investment, returns and revenue models.'],
 ['industrial','الدراسات الصناعية','Industrial studies','تحليل المصانع والتكاليف والطاقة الإنتاجية وسلاسل الإمداد والتشغيل.','Analysis of factories, costs, capacity, supply chains and operations.'],
 ['strategy','السياسات والاستراتيجيات','Policy & strategy','مراجعة المبادرات والسياسات وتحويلها إلى نماذج قابلة للتنفيذ والقياس.','Review of policies and initiatives to develop actionable and measurable models.'],
 ['library','مكتبة الدراسات','Research library','استفسر عن الدراسات والتقارير والتحليلات المتاحة لدى المركز.','Enquire about studies, reports and analysis available from the center.']
];
const steps=[['تحديد السؤال','Define the question','تحديد الفرصة والقرار ونطاق الدراسة.','Define the opportunity, decision and scope.'],['جمع الأدلة','Build the evidence','جمع المعلومات وتحليل السوق ونموذج الأعمال.','Gather information and assess the market and business model.'],['اختبار الافتراضات','Test assumptions','التحليل التشغيلي والمالي والمخاطر واختبارات الحساسية.','Operational and financial analysis, risk and sensitivity testing.'],['صياغة التوصية','Frame the recommendation','العناية الواجبة وبوابات القرار والتوصيات.','Due diligence, decision gates and recommendations.']];
let lang='ar';
const form=document.querySelector('#request-form');
function render(){
 const ar=lang==='ar';document.documentElement.lang=lang;document.documentElement.dir=ar?'rtl':'ltr';
 document.title=ar?'مركز صفوة للدراسات والاستشارات':'Safwah Center for Studies & Advisory';
 document.querySelector('meta[name=description]').content=ar?'دراسات استثمارية وجدوى وتحليل أسواق لدعم القرار — مركز صفوة.':'Investment research, feasibility and market analysis — Safwah Center for Studies & Advisory.';
 document.querySelectorAll('[data-ar]').forEach(e=>e.innerHTML=e.dataset[lang]);
 document.querySelector('#language').textContent=ar?'EN':'العربية';document.querySelector('#language').setAttribute('aria-label',ar?'Switch to English':'التبديل إلى العربية');
 document.querySelector('nav').setAttribute('aria-label',ar?'التنقل الرئيسي':'Main navigation');document.querySelector('.filters').setAttribute('aria-label',ar?'تصفية الدراسات':'Filter studies');
 document.querySelector('#service-grid').innerHTML=services.map((s,i)=>`<article class="service-card"><span class="num">0${i+1}</span><h3>${s[ar?1:2]}</h3><p>${s[ar?3:4]}</p><button class="text-link service-request" data-service="${s[0]}">${ar?'ناقش احتياجك ←':'Discuss your needs →'}</button></article>`).join('');
 const select=document.querySelector('#service-select'),old=select.value;select.innerHTML=`<option value="">${ar?'اختر المجال':'Select a field'}</option>`+services.map(s=>`<option value="${s[0]}">${s[ar?1:2]}</option>`).join('');select.value=old;
 document.querySelector('#steps').innerHTML=steps.map((s,i)=>`<article class="step"><span>0${i+1}</span><h3>${s[ar?0:1]}</h3><p>${s[ar?2:3]}</p></article>`).join('');
 document.querySelector('#form-status').textContent='';
}
document.querySelector('#language').addEventListener('click',()=>{lang=lang==='ar'?'en':'ar';render()});
function request(service,brief){document.querySelector('#service-select').value=service;if(brief)form.elements.brief.value=brief;document.querySelector('#request').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});form.elements.name.focus({preventScroll:true})}
document.querySelector('#service-grid').addEventListener('click',e=>{const b=e.target.closest('.service-request');if(b)request(b.dataset.service)});
document.querySelectorAll('.study-request').forEach(b=>b.addEventListener('click',()=>request(b.dataset.topic==='industrial'?'industrial':'market',lang==='ar'?`أرغب في الاستفسار عن دراسة ${b.dataset.topic==='industrial'?'مصنع الأدوات الصحية – جدة':'منصة B2B للصفقات التجارية'}.`:`I would like to enquire about the ${b.dataset.topic==='industrial'?'sanitary ware factory in Jeddah':'B2B trading platform'} study.`)));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});document.querySelectorAll('.study').forEach(x=>x.hidden=b.dataset.filter!=='all'&&x.dataset.type!==b.dataset.filter)}));
function message(){const d=new FormData(form),s=services.find(x=>x[0]===d.get('service'));return `${lang==='ar'?'طلب دراسة — مركز صفوة':'Study request — Safwah Center'}\n\nName: ${d.get('name')}\nEmail: ${d.get('email')}\nCompany: ${d.get('company')||'-'}\nStudy: ${s?s[lang==='ar'?1:2]:''}\n\n${d.get('brief')}`}
form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;location.href=`mailto:Info@Safwah-group.com?subject=${encodeURIComponent(lang==='ar'?'طلب دراسة — مركز صفوة':'Study request — Safwah Center')}&body=${encodeURIComponent(message())}`;document.querySelector('#form-status').textContent=lang==='ar'?'تم تجهيز الرسالة. أكمل إرسالها من تطبيق البريد. إن لم يفتح، انسخ الطلب وأرسله إلى البريد الموضح.':'Your message is prepared. Send it from your email app. If it does not open, copy the request and email it to the address shown.'});
document.querySelector('#copy-request').addEventListener('click',async()=>{if(!form.reportValidity())return;const status=document.querySelector('#form-status');try{await navigator.clipboard.writeText(message());status.textContent=lang==='ar'?'تم نسخ الطلب. أرسله إلى Info@Safwah-group.com.':'Request copied. Email it to Info@Safwah-group.com.'}catch{status.textContent=message();status.style.whiteSpace='pre-wrap'}});
render();
