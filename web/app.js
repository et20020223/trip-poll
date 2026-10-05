import {createTransport} from './transport.js?v=5';
const $ = s => document.querySelector(s);
const demo = !window.TRIP_CONFIG?.appsScriptUrl;
const stages = ['地點提案','第一輪初選','最終決選','結果與日期','景點募集'];
const descriptions = ['每人最多提案三個地點，也把不方便的週次留給我們。','看看大家的提案，選出你最想一起去的地方。','從入圍名單中，投下最後的選擇。','票選結果已公布，準備把出遊時間空下來。','目的地已確認，一起把值得去的景點加進行程。'];
let service, session = '', data, busy = false, tab = 'survey', loginClient;
function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
function ask(message) { return new Promise(resolve=>{const dialog=$('#confirm-dialog');$('#confirm-message').textContent=message;const done=value=>{dialog.close();resolve(value);};$('#confirm-cancel').onclick=()=>done(false);$('#confirm-accept').onclick=()=>done(true);dialog.oncancel=e=>{e.preventDefault();done(false);};dialog.showModal();}); }
function status(message='',kind='') { $('#status').textContent=message; $('#status').className=kind; }
function button(text,fn,cls='quiet') { const b=el('button',text,cls); b.type='button'; b.addEventListener('click',fn); return b; }
function heading(title,sub) { const h=el('div',undefined,'section-heading'); h.append(el('h2',title)); if(sub)h.append(el('p',sub)); return h; }
function field(form,name,label,type='text',value='',required=false,max=600) {
  const wrap=el('label',undefined,'field');wrap.append(el('span',label));
  const input=el(type==='textarea'?'textarea':'input'); if(type!=='textarea')input.type=type;
  input.name=name;input.value=value??'';input.required=required;
  if(['text','textarea','url','email'].includes(type))input.maxLength=max;
  if(type==='textarea')input.rows=3;wrap.append(input);form.append(wrap);return input;
}
function select(form,name,label,options,value) { const wrap=el('label',undefined,'field');wrap.append(el('span',label));const input=el('select');input.name=name;options.forEach(([id,text])=>{const o=el('option',text);o.value=id;input.append(o);});input.value=value;wrap.append(input);form.append(wrap);return input; }
function values(form) { return Object.fromEntries(new FormData(form)); }
function budget(p) { return p.budgetMin === null ? '預算待確認' : '約 NT$ '+p.budgetMin.toLocaleString()+'–'+p.budgetMax.toLocaleString()+' / 人'; }
function weekLabel(w) { return `${w.start.slice(5).replace('-','/')}（四）— ${w.end.slice(5).replace('-','/')}（二）`; }
async function api(action,value={}) { return service({action,value,session,revision:data?.config.revision}); }
async function mutate(action,value,message='已儲存。') {
  if(busy)return false;busy=true;setBusy(true);status('正在儲存…');
  try { data=await api(action,value);render();status(demo?'示範操作完成，未寫入 Google Sheets。':message,'success');return true; }
  catch(e) { status(e.message,'error');return false; }
  finally {busy=false;setBusy(false);}
}
function setBusy(value) { document.querySelectorAll('#workspace button,#workspace input,#workspace textarea,#workspace select,#edit-dialog button,#edit-dialog input,#edit-dialog textarea,#edit-dialog select,#logout').forEach(n=>n.disabled=value);if(!value&&$('#vote-form'))updateVoteCount(); }
function render() {
  $('#login').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;
  document.title=data.config.title;$('#title').textContent=data.config.title;
  $('#stage-description').textContent=descriptions[data.config.stage-1];
  $('#person-name').textContent=data.person.name;$('#person-email').textContent=data.person.email;$('#role').textContent=data.person.role==='admin'?'管理員':'員工';
  $('#tab-admin').hidden=data.person.role!=='admin';$('#tab-dates').hidden=data.config.stage===5;
  if(tab==='admin'&&data.person.role!=='admin'||tab==='dates'&&data.config.stage===5)tab='survey';
  $('#stage-track').replaceChildren();stages.forEach((name,i)=>{const n=el('div',undefined,i+1===data.config.stage?'stage current':i+1<data.config.stage?'stage done':'stage');n.append(el('span',String(i+1),'stage-number'),el('span',name));if(i+1===data.config.stage)n.setAttribute('aria-current','step');$('#stage-track').append(n);});
  $('#announcement').hidden=!data.config.announcement;$('#announcement').textContent=data.config.announcement;
  ['survey','dates','admin'].forEach(t=>$('#tab-'+t).classList.toggle('active',tab===t));
  $('#view').replaceChildren();
  if(tab==='admin')renderAdmin();else if(tab==='dates')renderDates();else renderSurvey();
}
function renderSurvey() {
  const stage=data.config.stage;
  if(stage===1)renderProposals();else if(stage===2||stage===3)renderVoting();else if(stage===4)renderResults();else renderAttractions();
}
function placeCard(p,selectable=false,selected=false) {
  const card=el('article',undefined,'place-card');
  const top=el('div',undefined,'card-top');top.append(el('span',p.finalist?'入圍地點':'旅遊提案','pill'));
  if(data.ownPlaceIds.includes(p.id))top.append(el('span','我的提案','hint'));card.append(top,el('h3',p.name),el('p',p.description,'card-description'));
  if(data.config.stage>=2){card.append(el('strong',budget(p),'budget'));const details=el('dl',undefined,'card-details');[['行程',p.days],['交通',p.transport],['住宿',p.stay],['亮點',p.highlights],['步行強度',p.intensity],['注意事項',p.notes]].forEach(([k,v])=>{if(v){details.append(el('dt',k),el('dd',v));}});if(details.children.length)card.append(details);if(p.referenceUrl){const a=el('a','查看參考資料 ↗','card-link');a.href=p.referenceUrl;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}}
  const controls=el('div',undefined,'card-controls');
  if(data.config.stage===1&&(data.ownPlaceIds.includes(p.id)||data.person.role==='admin'))controls.append(button('移除提案',async()=>{if(await ask(`移除「${p.name}」這個旅遊提案？移除後可重新新增提案。`))mutate('deletePlace',{id:p.id},'旅遊提案已移除。');},'quiet small'));
  if(selectable){const label=el('label',undefined,'vote-choice');const input=el('input');input.type='checkbox';input.name='choice';input.value=p.id;input.checked=selected;input.addEventListener('change',()=>{card.classList.toggle('selected',input.checked);updateVoteCount();});label.append(input,el('span','想去這裡'));controls.append(label);card.classList.toggle('selected',selected);}
  if(data.person.role==='admin'&&[2,3].includes(data.config.stage))controls.append(button('編輯卡片',()=>openEdit(p),'quiet small'));
  if(controls.children.length)card.append(controls);
  if(data.person.role==='admin'&&[2,3].includes(data.config.stage)&&(data.config.stage===2||p.finalist)) {
    const round=data.config.stage,stats=(round===2?data.results.primary:data.results.final).ranking.find(r=>r.id===p.id);
    const entry=el('div',undefined,'manual-vote-entry');entry.append(el('p',`線上 ${stats?.onlineVotes??stats?.votes??0} 票 ＋ 登記 ${stats?.manualVotes??0} 票 ＝ 合計 ${stats?.votes??0} 票`,'vote-summary'));
    const input=field(entry,'manualVotes',`管理員登記票數（${round===2?'初選':'決選'}）`,'number',stats?.manualVotes??0,true);input.min=0;input.max=1000000;input.step=1;
    entry.append(button('儲存登記票數',()=>{if(input.reportValidity())mutate('saveManualVotes',{id:p.id,round,votes:input.value},'登記票數已儲存，統計已更新。');},'quiet small'));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(input.reportValidity())mutate('saveManualVotes',{id:p.id,round,votes:input.value},'登記票數已儲存，統計已更新。');}});
    entry.append(el('p','填入本輪額外登記的票數；再次儲存會取代先前登記值。請勿重複登記已在線上投出的票。','hint'));card.append(entry);
  }
  return card;
}
function renderProposals() {
  const view=$('#view'), count=data.ownPlaceIds.length;
  const summary=el('div',undefined,'section-bar');summary.append(heading('把下一站提案出來',`每人最多 3 個 · 你已新增 ${count} / 3 個`),el('span',`${data.places.length} 個提案`,'pill'));view.append(summary);
  const layout=el('div',undefined,'proposal-layout'),grid=el('div',undefined,'place-grid');data.places.forEach(p=>grid.append(placeCard(p)));if(!data.places.length)grid.append(el('p','第一個提案，等你開啟。','empty'));
  const panel=el('section',undefined,'panel proposal-form');panel.append(heading('新增我的提案','你想去哪裡？說說值得一起去的理由。'));
  if(count>=3)panel.append(el('p','你已完成三個提案，謝謝你的想法。','notice'));else {const form=el('form');field(form,'name','想去的地點','text','',true,80);field(form,'description','推薦原因','textarea','',true,600);const b=el('button','新增地點 ＋','primary wide');b.type='submit';form.append(b);form.addEventListener('submit',e=>{e.preventDefault();mutate('addPlace',values(form),'地點已新增。');});panel.append(form);}
  layout.append(grid,panel);view.append(layout);view.append(el('p','也請切換到「我的日期」，新增不方便出遊的週次。','hint bottom-hint'));
}
function renderVoting() {
  const stage=data.config.stage,limit=stage===2?data.config.voteLimit2:data.config.voteLimit3,selected=stage===2?data.ballot2:data.ballot3;
  const eligible=data.places.filter(p=>stage===2||p.finalist),view=$('#view');
  const bar=el('div',undefined,'section-bar');bar.append(heading(stage===2?'第一輪：選出想去的地方':'最後一輪：決定下一站',`最多 ${limit} 票，每個地點一票。送出前可調整；再次送出會更新本輪選擇。`),el('span',selected.length?'已有投票紀錄':'尚未投票','pill'));view.append(bar);
  const form=el('form');form.id='vote-form';const grid=el('div',undefined,'place-grid');eligible.forEach(p=>grid.append(placeCard(p,true,selected.includes(p.id))));form.append(grid);
  if(!eligible.length)form.append(el('p','管理員尚未設定本輪地點。','empty'));
  const save=el('div',undefined,'save-bar');const tally=el('span','', 'vote-tally');tally.id='vote-tally';const submit=el('button',selected.length?'更新本輪投票':'儲存本輪投票','primary');submit.id='vote-submit';submit.type='submit';save.append(tally,submit);form.append(save);
  form.addEventListener('submit',e=>{e.preventDefault();mutate('vote',{round:stage,selections:[...form.querySelectorAll('[name="choice"]:checked')].map(n=>n.value)},'本輪投票已儲存。');});view.append(form);updateVoteCount();
  view.append(el('p','投票期間不顯示其他人的選擇。第四階段會公布匿名得票數；個別紀錄由負責人在試算表查看。','hint bottom-hint'));
}
function updateVoteCount() { const count=document.querySelectorAll('[name="choice"]:checked').length,limit=data.config.stage===2?data.config.voteLimit2:data.config.voteLimit3;$('#vote-tally').textContent=`已選 ${count} / ${limit} 票`+(count>limit?' · 請減少勾選':'');$('#vote-tally').classList.toggle('error',count>limit);$('#vote-submit').disabled=count>limit||busy; }
function renderDates() {
  const view=$('#view'),editable=[1,2,3].includes(data.config.stage);
  view.append(heading('哪些週次不方便？',`${data.config.year}/12 至 ${data.config.year+1}/02，每週星期四到下一週星期二，共六天；星期三不在週次內。跨月邊界會顯示完整週次。`));
  const layout=el('div',undefined,'dates-layout'),panel=el('section',undefined,'panel');panel.append(heading(editable?'新增不方便的週':'日期填寫已結束',editable?'沒有筆數上限，同一週會更新備註。':''));
  if(editable){const form=el('form');const picker=field(form,'date','選擇週內任一天','date','',true);picker.min=data.weeks[0].start;picker.max=data.weeks.at(-1).end;const selected=el('p','請選擇星期四至星期二的日期。','selected-week');const hidden=el('input');hidden.type='hidden';hidden.name='weekStart';form.append(hidden,selected);const note=field(form,'note','備註（選填）','textarea','',false,500);
    picker.addEventListener('change',()=>{const w=data.weeks.find(w=>picker.value>=w.start&&picker.value<=w.end);hidden.value=w?.start||'';selected.textContent=w?'整週不方便：'+weekLabel(w):'星期三不在候選週內，請選擇其他日期。';picker.setCustomValidity(w?'':'請選擇星期四至星期二。');if(w)note.value=data.unavailable.find(r=>r.weekStart===w.start)?.note||'';});
    const b=el('button','儲存這個週次 ＋','primary wide');b.type='submit';form.append(b);form.addEventListener('submit',e=>{e.preventDefault();mutate('saveUnavailable',{weekStart:hidden.value,note:note.value},'日期限制已儲存。');});panel.append(form);}
  const list=el('section',undefined,'panel');list.append(heading('我的日期紀錄',`${data.unavailable.length} 週不方便`));
  if(!data.unavailable.length)list.append(el('p','你還沒有填寫不方便的週次。沒有紀錄不代表已確認能參加。','empty'));
  data.unavailable.slice().sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).forEach(r=>{const w=data.weeks.find(w=>w.start===r.weekStart);const row=el('div',undefined,'date-record');const copy=el('div');copy.append(el('strong',w?weekLabel(w):r.weekStart),el('p',r.note||'沒有備註','hint'));row.append(copy);if(editable)row.append(button('移除',async()=>{if(await ask('移除這個不方便的週次？'))mutate('deleteUnavailable',{id:r.id});},'quiet small'));list.append(row);});layout.append(panel,list);view.append(layout);
}
function finalAnnouncement() {
  const p=data.places.find(p=>p.id===data.config.finalPlace),banner=el('section',undefined,'final-banner');banner.append(el('span','OUR NEXT DESTINATION','eyebrow'),el('h2',p?.name||'等待管理員確認目的地'),el('p',data.config.finalStart?`${data.config.finalStart} — ${data.config.finalEnd}`:'出遊日期尚未公布'));return banner;
}
function ranking(result,title) {
  const panel=el('section',undefined,'panel');panel.append(heading(title,`${result.voters} / ${result.total} 人有線上投票紀錄 · 另有 ${result.manualTotal??0} 票由管理員登記，已計入得票數`));
  if(!result.ranking.length)panel.append(el('p','尚無候選地點。','empty'));
  const max=Math.max(1,...result.ranking.map(p=>p.votes));result.ranking.forEach((p,i)=>{const row=el('div',undefined,'ranking-row');row.append(el('span',String(i+1).padStart(2,'0'),'rank-index'),el('strong',p.name),el('span',p.votes+' 票','votes'));const progress=el('div',undefined,'progress');const fill=el('span');fill.style.width=(p.votes/max*100)+'%';progress.append(fill);panel.append(row,progress);});return panel;
}
function renderResults() { const view=$('#view');view.append(finalAnnouncement(),heading('大家的最終選擇','僅公布得票數，不公開投票者姓名。票數相同時並列，由管理員確認最終目的地。'));const grid=el('div',undefined,'results-grid');grid.append(ranking(data.results.final,'最終決選'),ranking(data.results.primary,'第一輪初選'));view.append(grid); }
function renderAttractions() {
  const view=$('#view');view.append(finalAnnouncement(),heading('一起把行程填滿','想去的景點、想吃的店，或值得留時間的活動，都可以推薦。'));
  const layout=el('div',undefined,'proposal-layout'),grid=el('div',undefined,'place-grid');data.attractions.forEach(a=>{const card=el('article',undefined,'place-card');card.append(el('span','景點推薦','pill'),el('h3',a.name),el('p',a.description));if(a.url){const link=el('a','查看景點 ↗','card-link');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}if(a.own||data.person.role==='admin')card.append(button('刪除推薦',async()=>{if(await ask('刪除這個景點推薦？'))mutate('deleteAttraction',{id:a.id});},'quiet small'));grid.append(card);});if(!data.attractions.length)grid.append(el('p','第一個推薦，等你分享。','empty'));
  const panel=el('section',undefined,'panel');panel.append(heading('新增想去的景點'));const form=el('form');field(form,'name','景點／店家名稱','text','',true,100);field(form,'description','推薦原因','textarea','',true,600);field(form,'url','參考連結（HTTPS，選填）','url','',false,1000);const b=el('button','新增景點 ＋','primary wide');b.type='submit';form.append(b);form.addEventListener('submit',e=>{e.preventDefault();mutate('addAttraction',values(form),'景點已新增。');});panel.append(form);layout.append(grid,panel);view.append(layout);
}
function renderAdmin() {
  const view=$('#view'),c=data.config;view.append(heading('管理後台','設定階段、票數、員工權限與出遊公告。管理員也能使用旅遊調查參與提案與投票。'));
  const layout=el('div',undefined,'admin-grid'),panel=el('section',undefined,'panel');panel.append(heading('調查設定'));
  const form=el('form');select(form,'stage','目前階段',stages.map((s,i)=>[String(i+1),`階段 ${i+1} · ${s}`]),String(c.stage));const nums=el('div',undefined,'form-grid');const n2=field(nums,'voteLimit2','初選：每人最多幾票','number',c.voteLimit2,true);n2.min=1;n2.max=100;const n3=field(nums,'voteLimit3','決選：每人最多幾票','number',c.voteLimit3,true);n3.min=1;n3.max=100;form.append(nums);
  if(c.stage>=4){select(form,'finalPlace','最終目的地',[['','尚未選定'],...data.places.filter(p=>p.finalist).map(p=>[p.id,p.name])],c.finalPlace);const dates=el('div',undefined,'form-grid');field(dates,'finalStart','出發日期','date',c.finalStart);field(dates,'finalEnd','返回日期','date',c.finalEnd);form.append(dates);}else form.append(el('p','第四階段可選定最終目的地與日期。第三階段開始前，請先編輯卡片勾選入圍地點。','hint'));
  field(form,'announcement','給同事的公告','textarea',c.announcement,false,1000);const save=el('button','儲存調查設定','primary wide');save.type='submit';form.append(save);form.addEventListener('submit',async e=>{e.preventDefault();const v=values(form);if(Number(v.stage)!==c.stage&&!await ask(`將切換至「${stages[Number(v.stage)-1]}」。同事可操作的功能會立即改變，是否繼續？`))return;mutate('saveSettings',{...v,finalPlace:v.finalPlace??c.finalPlace,finalStart:v.finalStart??c.finalStart,finalEnd:v.finalEnd??c.finalEnd},'調查設定已更新。');});panel.append(form);
  const schedule=el('section',undefined,'panel');schedule.append(heading('日期限制統計','只代表已填寫不方便的人數，沒有紀錄不等於可以參加。'));data.weekSummary.forEach(w=>{const r=el('div',undefined,'date-stat');r.append(el('span',weekLabel(w)),el('strong',w.count+' 人不方便'));schedule.append(r);});layout.append(panel,schedule);view.append(layout);
  if([2,3].includes(c.stage)){view.append(heading('地點資料與入圍名單','編輯卡片可補充投票參考資訊，並勾選最終決選的入圍地點。'));const grid=el('div',undefined,'place-grid');data.places.forEach(p=>grid.append(placeCard(p)));view.append(grid);}
  const results=el('div',undefined,'results-grid');results.append(ranking(data.results.primary,'初選統計（管理員）'),ranking(data.results.final,'決選統計（管理員）'));view.append(results);
  const users=el('section',undefined,'panel users-panel');users.append(heading('員工登入名單','一般員工只能操作自己的資料；管理員可以設定階段、編輯卡片與維護名單。'));
  const userForm=el('form',undefined,'form-grid');userForm.id='user-form';field(userForm,'email','Email','email','',true,254);field(userForm,'name','姓名','text','',true,80);field(userForm,'department','部門','text','',false,80);select(userForm,'role','角色',[['member','一般員工'],['admin','管理員']],'member');select(userForm,'active','帳號狀態',[['true','啟用'],['false','停用']],'true');const b=el('button','新增／更新員工','primary');b.type='submit';userForm.append(b);userForm.addEventListener('submit',e=>{e.preventDefault();const v=values(userForm);mutate('saveUser',{...v,active:v.active==='true'},'員工名單已更新。');});users.append(userForm);
  const scroll=el('div',undefined,'table-scroll'),table=el('table'),thead=el('thead'),hr=el('tr');['員工','Email','角色','狀態','操作'].forEach(t=>hr.append(el('th',t)));thead.append(hr);table.append(thead);const tbody=el('tbody');data.users.forEach(u=>{const row=el('tr');[u.name,u.email,u.role==='admin'?'管理員':'一般員工',u.active?'啟用':'停用'].forEach(t=>row.append(el('td',t)));const td=el('td');td.append(button('編輯',()=>{Object.entries(u).forEach(([k,v])=>{if(userForm.elements.namedItem(k))userForm.elements.namedItem(k).value=String(v);});userForm.scrollIntoView({behavior:'smooth',block:'center'});},'quiet small'));row.append(td);tbody.append(row);});table.append(tbody);scroll.append(table);users.append(scroll);view.append(users);
}
function openEdit(p) {
  const fields=$('#edit-fields');fields.replaceChildren();const id=el('input');id.type='hidden';id.name='id';id.value=p.id;fields.append(id);
  field(fields,'name','地點名稱','text',p.name,true,80);field(fields,'days','行程天數','text',p.days,false,80);field(fields,'description','簡介','textarea',p.description,true,600);
  const min=field(fields,'budgetMin','每人預算下限（NT$）','number',p.budgetMin??'');min.min=0;const max=field(fields,'budgetMax','每人預算上限（NT$）','number',p.budgetMax??'');max.min=0;
  field(fields,'transport','交通方式與時間','textarea',p.transport,false,300);field(fields,'stay','住宿安排','textarea',p.stay,false,300);field(fields,'highlights','活動亮點','textarea',p.highlights,false,600);field(fields,'intensity','步行強度／參加條件','text',p.intensity,false,200);field(fields,'notes','費用包含與其他注意事項','textarea',p.notes,false,600);field(fields,'referenceUrl','參考網址（HTTPS）','url',p.referenceUrl,false,1000);select(fields,'finalist','最終決選入圍',[['false','尚未入圍'],['true','列入最終決選']],String(p.finalist));$('#edit-dialog').showModal();
}
$('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const v=values(e.target);if(await mutate('editPlace',{...v,finalist:v.finalist==='true'},'地點卡片已更新。'))$('#edit-dialog').close();});$('#close-dialog').addEventListener('click',()=>$('#edit-dialog').close());
['survey','dates','admin'].forEach(t=>$('#tab-'+t).addEventListener('click',()=>{tab=t;render();}));
$('#refresh').addEventListener('click',async()=>{if(busy)return;busy=true;setBusy(true);try{data=await api('load');render();status('已讀取最新資料。','success');}catch(e){status(e.message,'error');}finally{busy=false;setBusy(false);}});
$('#logout').addEventListener('click',async()=>{if(busy)return;try{await api('logout');}catch{}session='';data=null;tab='survey';$('#workspace').hidden=true;$('#login').hidden=false;$('#logout').hidden=true;status('已登出。');if(!demo)prepareLogin();});
$('#demo-login').addEventListener('click',()=>{const result=window.demoService.login($('#demo-account').value);session=result.session;data=result.data;render();status();});
$('#google-login').addEventListener('click',()=>loginClient?.requestCode());
async function prepareLogin() {
  $('#google-login').disabled=true;
  try {
    const boot=await service({action:'bootstrap'});
    if(!boot.ready)throw new Error('管理員尚未完成 Google 登入設定，請聯絡旅遊負責人。');
    if(!window.google?.accounts?.oauth2)await new Promise((resolve,reject)=>{const script=el('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(new Error('無法載入 Google 登入服務。'));document.head.append(script);});
    const {challenge}=await service({action:'loginBegin'});
    loginClient=google.accounts.oauth2.initCodeClient({client_id:boot.clientId,scope:'openid email profile',ux_mode:'popup',include_granted_scopes:false,select_account:true,state:challenge,
      callback:async result=>{if(result.error||result.state!==challenge){status('登入取消或驗證狀態不符，請重新登入。','error');prepareLogin();return;}$('#google-login').disabled=true;status('正在確認登入與員工權限…');try{const r=await service({action:'login',code:result.code,challenge});session=r.session;data=r.data;render();status();}catch(e){status(e.message,'error');prepareLogin();}},error_callback:()=>{status('登入視窗未完成，請允許彈出視窗後再試。','error');prepareLogin();}});
    $('#google-login').disabled=false;$('#login-hint').textContent='登入後只允許員工名單內已啟用的 Email 繼續。';
  } catch(e) {$('#login-hint').textContent=e.message;status(e.message,'error');}
}
async function init() {
  $('#mode').textContent=demo?'本機示範':'員工旅遊';$('#demo-banner').hidden=!demo;
  if(demo){const {createDemoService}=await import('./demo.js?v=6');window.demoService=createDemoService();service=window.demoService.request;$('#google-login').hidden=true;$('#demo-login-area').hidden=false;$('#login-hint').textContent='這裡只提供角色操作預覽，正式網站必須完成 Google 登入。';}
  else {try{service=createTransport(window.TRIP_CONFIG.appsScriptUrl);await prepareLogin();}catch(e){status(e.message,'error');$('#login-hint').textContent=e.message;}}
}
init();
