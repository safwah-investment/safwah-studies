// Safwah's requested chart of accounts, separate from transaction kind.
const financeAccounts=[
['الأصول المتداولة',['النقدية من الخزينة','حساب البنك الجاري','المدينون','تأمين طبي مقدم','إيجار مقدم','مدفوعات مقدمة للموظفين','الضريبة على المدخلات']],
['الأصول الثابتة',['أجهزة مكتبية ومعدات طباعة','الأجهزة الكهربائية','الأثاث والمفروشات','أجهزة حاسب وطابعات']],
['الالتزامات',['مصروفات مستحقة','ضريبة القيمة المضافة المستحقة','مستحقات المؤسسة العامة للتأمينات الاجتماعية']],
['الإيرادات',['إيرادات المبيعات / الخدمات']],
['المصروفات',['مصاريف تسويقية ودعائية','مصاريف ضيافة','كهرباء ومياه','مصروف نقل ومواصلات','إنترنت وهاتف','سفر وإقامة']]
];
function populateAccounts(select,placeholder){
 const first=document.createElement('option');first.value='';first.textContent=placeholder;select.append(first);
 for(const [group,names] of financeAccounts){const element=document.createElement('optgroup');element.label=group;for(const name of names){const option=document.createElement('option');option.value=name;option.textContent=name;element.append(option)}select.append(element)}
}
function accountBankVisibility(){const field=document.querySelector('#bank-field'),account=document.querySelector('#form [name=account]');field.hidden=account.value!=='حساب البنك الجاري';field.querySelector('input').required=!field.hidden;if(field.hidden)field.querySelector('input').value='';}
populateAccounts(document.querySelector('#account-filter'),'جميع الحسابات');
populateAccounts(document.querySelector('#form [name=account]'),'غير مصنف — تحديد لاحقًا');
document.querySelector('#form [name=account]').onchange=accountBankVisibility;
if(typeof module!=='undefined')module.exports={financeAccounts};
