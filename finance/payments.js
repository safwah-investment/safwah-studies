// Hosted payment links only; payment status is never inferred from opening a URL.
function normalizePaymentUrl(value){
 if(typeof value!=='string')throw Error('أدخل رابط فاتورة دفع صحيحًا.');
 const text=value.trim();if(!text)return '';
 if(text.length>2048||/[\u0000-\u0020\u007f]/.test(text)||!/^https:\/\//i.test(text))throw Error('استخدم رابط HTTPS لفاتورة MyFatoorah السعودية.');
 let url;try{url=new URL(text)}catch{throw Error('رابط فاتورة الدفع غير صالح.');}
 if(url.protocol!=='https:'||url.hostname!=='sa.myfatoorah.com'||url.port||url.username||url.password||url.href.length>2048)throw Error('الرابط المسموح من sa.myfatoorah.com فقط، دون بيانات دخول أو منفذ خاص.');
 return url.href;
}
function paymentRemaining(record){
 if(!Number.isSafeInteger(record.amount)||record.amount<=0||!Array.isArray(record.payments))return 0;
 let paid=0;for(const payment of record.payments){if(!Number.isSafeInteger(payment.amount)||payment.amount<=0)return 0;paid+=payment.amount}
 return Number.isSafeInteger(paid)?Math.max(0,record.amount-paid):0;
}
function preparePaymentRecord(previous,next){
 const result={...next},input=next.paymentUrl;delete result.paymentUrl;delete result.paymentLink;
 if(previous?.paymentLink)result.paymentLink={url:previous.paymentLink.url,amountHalalas:previous.paymentLink.amountHalalas};
 if(input===undefined)return result;
 if(typeof input!=='string')throw Error('أدخل رابط فاتورة دفع صحيحًا.');
 if(next.kind!=='إيراد'){if(input.trim())throw Error('روابط تحصيل الفواتير متاحة لحركات الإيراد فقط.');return result}
 const url=normalizePaymentUrl(input);if(!url){delete result.paymentLink;return result}
 let oldUrl='';try{oldUrl=normalizePaymentUrl(previous?.paymentLink?.url||'')}catch{}
 if(oldUrl===url&&Number.isSafeInteger(previous?.paymentLink?.amountHalalas)&&previous.paymentLink.amountHalalas>0){result.paymentLink={url,amountHalalas:previous.paymentLink.amountHalalas};return result}
 const due=paymentRemaining(next);if(!due)throw Error('لا يوجد مبلغ متبقٍ لإنشاء رابط تحصيل.');
 result.paymentLink={url,amountHalalas:due};return result;
}
function paymentLinkState(record){
 const dueHalalas=paymentRemaining(record),base={url:'',dueHalalas,active:false,stale:false};
 if(!record.paymentLink)return {...base,status:'empty'};
 let url;try{url=normalizePaymentUrl(record.paymentLink.url)}catch{return {...base,status:'invalid'}}
 if(!url||!Number.isSafeInteger(record.paymentLink.amountHalalas)||record.paymentLink.amountHalalas<=0)return {...base,status:'invalid'};
 const amountHalalas=record.paymentLink.amountHalalas;
 if(record.kind!=='إيراد')return {...base,url,amountHalalas,status:'ineligible'};
 if(!dueHalalas)return {...base,url,amountHalalas,status:'paid'};
 if(dueHalalas!==amountHalalas)return {...base,url,amountHalalas,status:'stale',stale:true};
 return {...base,url,amountHalalas,status:'ready',active:true};
}
if(typeof module!=='undefined')module.exports={normalizePaymentUrl,paymentRemaining,preparePaymentRecord,paymentLinkState};
