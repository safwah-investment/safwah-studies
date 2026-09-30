const btn=document.getElementById('langToggle');let lang='ar';
function applyLang(next){lang=next;document.body.classList.toggle('en',lang==='en');document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.querySelectorAll('[data-ar][data-en]').forEach(el=>{el.innerHTML=el.dataset[lang]});btn.textContent=lang==='ar'?'EN':'عربي';localStorage.setItem('granolaLang',lang);}
btn.addEventListener('click',()=>applyLang(lang==='ar'?'en':'ar'));
applyLang(localStorage.getItem('granolaLang')||'ar');