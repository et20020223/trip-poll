import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const generated=readFileSync(new URL('../web/demo.js',import.meta.url),'utf8');
const mock=generated.slice(0,generated.indexOf('/** Private')).replace('export function createDemoService()', 'function backend()');
function backend() {
  const context=vm.createContext({crypto:webcrypto,TextEncoder,Date,console});
  vm.runInContext(mock+source+`
    setup_();
    return {api,rows:rows_,settings:setting_,sheet:sheet_,config:config_,weeks:weeks_,cache:CacheService.getScriptCache(),digest:digest_,login:(email,sub='test-sub')=>{
      const user=userByEmail_(email);const row=rows_('Users')[user.index];row[5]=sub;write_('Users',user.index,row);const session=uid_();CacheService.getScriptCache().put('session:'+digest_(session),JSON.stringify({email,sub,expires:Date.now()+600000}),600);return session;
    },setFetch:fn=>UrlFetchApp.fetch=fn,setProperty:(k,v)=>props.set(k,v)};
  }
  `,context);
  const b=context.backend(),adminEmail='admin@example.com';
  b.admin=b.login(adminEmail);b.call=(session,action,value={},revision=b.config().revision)=>JSON.parse(JSON.stringify(b.api({session,action,value,revision})));
  b.call(b.admin,'saveUser',{email:'member@example.com',name:'同事',department:'研發',role:'member',active:true});
  b.member=b.login('member@example.com','member-sub');
  b.call(b.admin,'saveUser',{email:'other@example.com',name:'另一位',department:'營運',role:'member',active:true});
  b.other=b.login('other@example.com','other-sub');
  b.transition=(stage,extra={})=>b.call(b.admin,'saveSettings',{stage,voteLimit2:3,voteLimit3:1,finalPlace:'',finalStart:'',finalEnd:'',announcement:'',...extra});
  b.add=(session,name='地點'+b.rows('Places').length)=>b.call(session,'addPlace',{name,description:'推薦理由'});
  b.edit=(id,extra={})=>{const p=b.call(b.admin,'load').places.find(p=>p.id===id);return b.call(b.admin,'editPlace',{...p,...extra});};
  return b;
}
function seedFinalists(b) { b.add(b.member,'宜蘭');b.add(b.other,'台中');b.transition(2);const ids=b.call(b.member,'load').places.map(p=>p.id);ids.forEach(id=>b.edit(id,{finalist:true}));return ids; }

test('unauthenticated requests fail; role changes and revocation apply to existing sessions',()=>{
  const b=backend();assert.throws(()=>b.call('', 'load'),/先登入/);
  assert.throws(()=>b.call(b.member,'saveSettings',{}),/管理員/);
  assert.throws(()=>b.call(b.member,'saveUser',{}),/管理員/);
  const member=b.call(b.member,'load');assert.equal(member.person.role,'member');assert.equal(member.users,undefined);assert.equal(member.results,null);
  b.call(b.admin,'saveUser',{email:'member@example.com',name:'同事',department:'',role:'admin',active:true});
  assert.equal(b.call(b.member,'load').person.role,'admin');
  b.call(b.admin,'saveUser',{email:'member@example.com',name:'同事',department:'',role:'member',active:false});
  assert.throws(()=>b.call(b.member,'load'),/沒有填寫權限/);
  assert.throws(()=>b.call(b.admin,'saveUser',{email:'admin@example.com',name:'Willy',department:'',role:'member',active:true}),/自己/);
});

test('three proposals per account, duplicate names and stale stage protection are enforced server side',()=>{
  const b=backend();for(let i=0;i<3;i++)b.add(b.member);
  assert.throws(()=>b.add(b.member,'第四個'),/最多新增三個/);b.add(b.admin,'管理員也可以');
  assert.throws(()=>b.add(b.other,'管理員也可以'),/同名地點/);
  const old=b.config().revision;b.transition(2);
  assert.throws(()=>b.call(b.other,'addPlace',{name:'過期',description:'x'},old),/已更新/);
  assert.throws(()=>b.add(b.other),/階段/);
});

test('proposal deletion enforces ownership, frees quota and preserves recorded votes and the final destination',()=>{
  const b=backend();
  for(let i=0;i<3;i++)b.add(b.member);
  let places=b.call(b.member,'load').places;
  assert.throws(()=>b.call(b.other,'deletePlace',{id:places[0].id}),/自己的旅遊提案/);
  b.call(b.member,'deletePlace',{id:places[2].id});
  assert.equal(b.rows('Places').length,2);
  b.add(b.member,'釋出名額後的新提案');
  assert.equal(b.call(b.member,'load').ownPlaceIds.length,3);
  const next=b.call(b.member,'load').places.find(p=>p.name==='釋出名額後的新提案');
  b.sheet('Places').getRange(3,1,1,15).setValues([Array(15).fill('')]);
  b.call(b.admin,'deletePlace',{id:next.id});
  assert.equal(b.rows('Places').length,1);
  assert.throws(()=>b.call(b.admin,'deletePlace',{id:next.id}),/不存在/);
  const id=b.call(b.member,'load').places[0].id;
  b.transition(2);b.edit(id,{finalist:true});
  assert.throws(()=>b.call(b.member,'deletePlace',{id}),/階段/);
  b.call(b.member,'vote',{round:2,selections:[id]});b.transition(1);
  assert.throws(()=>b.call(b.member,'deletePlace',{id}),/已有選票/);
  b.transition(2);b.call(b.member,'vote',{round:2,selections:[]});b.transition(4);
  b.transition(4,{finalPlace:id,finalStart:'2026-12-03',finalEnd:'2026-12-06'});
  b.transition(1,{finalPlace:id,finalStart:'2026-12-03',finalEnd:'2026-12-06'});
  assert.throws(()=>b.call(b.admin,'deletePlace',{id}),/選定為目的地/);
});

test('week generator handles year boundaries, leap years and Wednesday gaps; own records only',()=>{
  const b=backend(),weeks=JSON.parse(JSON.stringify(b.weeks(2026)));
  assert.equal(weeks[0].start,'2026-11-26');assert.equal(weeks[0].end,'2026-12-01');assert.equal(weeks.at(-1).end,'2027-03-02');
  for(const w of weeks){assert.equal(new Date(w.start).getUTCDay(),4);assert.equal(new Date(w.end).getUTCDay(),2);assert.equal((new Date(w.end)-new Date(w.start))/86400000,5);b.call(b.member,'saveUnavailable',{weekStart:w.start,note:'無法'});}
  assert.equal(b.call(b.member,'load').unavailable.length,weeks.length);
  b.call(b.member,'saveUnavailable',{weekStart:weeks[0].start,note:'更新備註'});
  assert.equal(b.rows('UnavailableWeeks').length,weeks.length);assert.equal(b.call(b.member,'load').unavailable[0].note,'更新備註');
  assert.equal(b.call(b.other,'load').unavailable.length,0);
  assert.throws(()=>b.call(b.other,'deleteUnavailable',{id:b.rows('UnavailableWeeks')[0][0]}),/你的日期/);
  assert.throws(()=>b.call(b.member,'saveUnavailable',{weekStart:'2026-12-02',note:''}),/候選週/);
  assert.ok(b.weeks(2027).some(w=>w.start<='2028-02-29'&&w.end>='2028-02-29'));
});

test('native Sheets date cells preserve Taipei calendar days, weekly counts and upserts',()=>{
  const b=backend();
  b.call(b.member,'saveUnavailable',{weekStart:'2026-12-03',note:'原始備註'});
  b.sheet('UnavailableWeeks').getRange(2,3,1,1).setValues([[new Date('2026-12-02T16:00:00Z')]]);
  const data=b.call(b.admin,'load');
  assert.equal(data.weekSummary.find(w=>w.start==='2026-12-03').count,1);
  assert.equal(b.call(b.member,'load').unavailable[0].weekStart,'2026-12-03');
  b.call(b.member,'saveUnavailable',{weekStart:'2026-12-03',note:'更新備註'});
  assert.equal(b.rows('UnavailableWeeks').length,1);
  assert.equal(b.call(b.member,'load').unavailable[0].note,'更新備註');
  b.settings('FINAL_START',new Date('2026-12-02T16:00:00Z'));
  b.settings('FINAL_END',new Date('2026-12-05T16:00:00Z'));
  assert.equal(b.config().finalStart,'2026-12-03');
  assert.equal(b.config().finalEnd,'2026-12-06');
});

test('rounds are separate upserts; limits, duplicate votes and finalists are checked',()=>{
  const b=backend(),ids=seedFinalists(b);
  assert.throws(()=>b.call(b.member,'vote',{round:2,selections:[ids[0],ids[0]]}),/每個地點/);
  b.call(b.member,'vote',{round:2,selections:ids});b.call(b.member,'vote',{round:2,selections:[ids[0]]});
  assert.equal(b.rows('Ballots').length,1);assert.deepEqual(b.call(b.member,'load').ballot2,[ids[0]]);
  b.transition(3);assert.throws(()=>b.call(b.member,'vote',{round:2,selections:[ids[0]]}),/輪次/);
  assert.throws(()=>b.call(b.member,'vote',{round:3,selections:ids}),/最多 1 票/);
  assert.throws(()=>b.call(b.member,'vote',{round:3,selections:['non-finalist']}),/未入圍/);
  b.call(b.member,'vote',{round:3,selections:[ids[1]]});
  assert.equal(b.rows('Ballots').length,2);assert.deepEqual(b.call(b.member,'load').ballot2,[ids[0]]);assert.deepEqual(b.call(b.member,'load').ballot3,[ids[1]]);
  assert.throws(()=>b.edit(ids[1],{finalist:false}),/已有最終票/);
});

test('lowering limits cannot silently invalidate existing ballots',()=>{
  const b=backend(),ids=seedFinalists(b);b.call(b.member,'vote',{round:2,selections:ids});
  assert.throws(()=>b.transition(2,{voteLimit2:1}),/低於已儲存票數/);assert.equal(b.config().voteLimit2,3);
});

test('results are anonymous and eligibility, stage prerequisites and confirmed trip dates are enforced',()=>{
  const b=backend();assert.throws(()=>b.transition(2),/至少新增/);b.add(b.member);b.transition(2);assert.throws(()=>b.transition(3),/入圍/);
  const id=b.call(b.member,'load').places[0].id;b.edit(id,{finalist:true});b.transition(3);b.call(b.member,'vote',{round:3,selections:[id]});
  assert.equal(b.call(b.member,'load').results,null);b.transition(4);
  const stats=b.call(b.member,'load').results.final;assert.equal(stats.ranking[0].votes,1);assert.ok(!JSON.stringify(stats).includes('member@example.com'));
  assert.throws(()=>b.call(b.member,'vote',{round:3,selections:[id]}),/階段/);
  assert.throws(()=>b.call(b.member,'saveUnavailable',{weekStart:'2026-12-03',note:''}),/階段/);
  assert.throws(()=>b.transition(5),/確認/);
  assert.throws(()=>b.transition(4,{finalPlace:id,finalStart:'2026-12-09',finalEnd:'2026-12-10'}),/候選週/);
  b.transition(4,{finalPlace:id,finalStart:'2026-12-03',finalEnd:'2026-12-06'});b.transition(5,{finalPlace:id,finalStart:'2026-12-03',finalEnd:'2026-12-06'});
  b.call(b.member,'addAttraction',{name:'博物館',description:'一起參觀',url:'https://example.com/place'});
  const attraction=b.call(b.other,'load').attractions[0];assert.equal(attraction.own,false);assert.equal(attraction.email,undefined);
  assert.throws(()=>b.call(b.other,'deleteAttraction',{id:attraction.id}),/自己/);b.call(b.admin,'deleteAttraction',{id:attraction.id});assert.equal(b.rows('Attractions').length,0);
});

test('card fields, unsafe links and spreadsheet formulas are validated and escaped',()=>{
  const b=backend();b.add(b.member,'=地點');assert.ok(b.rows('Places')[0][1].startsWith("'="));assert.equal(b.call(b.member,'load').places[0].name,'=地點');b.transition(2);const id=b.rows('Places')[0][0];
  assert.throws(()=>b.edit(id,{referenceUrl:'javascript:alert(1)'}),/HTTPS/);
  assert.throws(()=>b.edit(id,{budgetMin:8000,budgetMax:4000}),/預算範圍/);
  b.edit(id,{budgetMin:4000,budgetMax:8000,notes:'=IMPORTXML("https://example.com")',finalist:true});
  assert.ok(b.rows('Places')[0][10].startsWith("'="));assert.equal(b.call(b.member,'load').places[0].notes,'=IMPORTXML("https://example.com")');
});

test('blank spreadsheet rows do not cause updates or deletions to target someone else',()=>{
  const b=backend();const users=b.sheet('Users');users.rows.splice(1,0,['','','','','','']);
  b.call(b.admin,'saveUser',{email:'member@example.com',name:'更新同事',department:'',role:'member',active:true});assert.equal(b.call(b.member,'load').person.name,'更新同事');assert.equal(users.rows[1][0],'');
  b.call(b.member,'saveUnavailable',{weekStart:'2026-12-03',note:'自己的'});b.sheet('UnavailableWeeks').rows.splice(1,0,['','','','','']);
  const id=b.call(b.member,'load').unavailable[0].id;b.call(b.member,'deleteUnavailable',{id});assert.equal(b.rows('UnavailableWeeks').length,0);
});

test('OAuth code exchange validates server identity, nonce expiry/reuse and allowlist; client email is ignored',()=>{
  const b=backend();b.setProperty('GOOGLE_CLIENT_ID','client.apps.googleusercontent.com');b.setProperty('GOOGLE_CLIENT_SECRET','secret');
  let identity={email:'member@example.com',email_verified:true,hd:'example.com',sub:'member-sub'},calls=[];
  b.setFetch((url,options)=>{calls.push({url,options});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('/token')?{access_token:'google-access'}:identity)};});
  const challenge=()=>b.api({action:'loginBegin'}).challenge;
  const first=challenge();const login=b.api({action:'login',challenge:first,code:'google-code',email:'admin@example.com'});
  assert.equal(login.data.person.email,'member@example.com');assert.equal(login.data.person.role,'member');assert.equal(calls[0].options.payload.redirect_uri,'http://127.0.0.1:4173');assert.equal(calls[0].options.payload.client_secret,'secret');
  assert.throws(()=>b.api({action:'login',challenge:first,code:'google-code'}),/過期/);
  identity.email='not-allowed@example.com';assert.throws(()=>b.api({action:'login',challenge:challenge(),code:'code'}),/沒有填寫權限/);
  identity.email='member@example.com';identity.email_verified=false;assert.throws(()=>b.api({action:'login',challenge:challenge(),code:'code'}),/已驗證/);
  identity.email_verified=true;identity.hd='';assert.equal(b.api({action:'login',challenge:challenge(),code:'code'}).data.person.email,'member@example.com');
  identity.hd='example.com';identity.sub='changed-sub';assert.throws(()=>b.api({action:'login',challenge:challenge(),code:'code'}),/身分已變更/);
  identity.sub='member-sub';b.setProperty('GOOGLE_WORKSPACE_DOMAIN','legacy-company.com');assert.equal(b.api({action:'login',challenge:challenge(),code:'code'}).data.person.email,'member@example.com');
  b.call(login.session,'logout');assert.throws(()=>b.call(login.session,'load'),/過期/);
});

test('public login preparation exposes no survey data; Google accounts from other domains remain subject to the roster',()=>{
  const b=backend();b.setProperty('GOOGLE_CLIENT_ID','client.apps.googleusercontent.com');b.setProperty('GOOGLE_CLIENT_SECRET','private-secret');
  const boot=b.api({action:'bootstrap'});assert.deepEqual(Object.keys(boot).sort(),['clientId','ready','title']);assert.equal(boot.ready,true);assert.equal(JSON.stringify(boot).includes('private-secret'),false);
  const challenge=()=>b.api({action:'loginBegin'}).challenge;
  assert.throws(()=>b.api({action:'load',email:'admin@example.com'}),/先登入/);
  assert.throws(()=>b.api({action:'saveUser',email:'admin@example.com',value:{email:'intruder@gmail.com',role:'admin',active:true}}),/先登入/);
  let identity={email:'allowed@gmail.com',email_verified:true,sub:'gmail-sub'};
  b.setFetch(url=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('/token')?{access_token:'google-access'}:identity)}));
  b.call(b.admin,'saveUser',{email:identity.email,name:'Gmail 同事',department:'',role:'member',active:true});
  assert.equal(b.api({action:'login',challenge:challenge(),code:'code'}).data.person.role,'member');
  identity={email:'other@example.com',email_verified:true,hd:'external-company.example',sub:'other-sub'};
  assert.equal(b.api({action:'login',challenge:challenge(),code:'code'}).data.person.email,'other@example.com');
  identity={email:'unknown@gmail.com',email_verified:true,sub:'unknown-sub'};
  assert.throws(()=>b.api({action:'login',challenge:challenge(),code:'code'}),/沒有填寫權限/);
  identity={email:'allowed@gmail.com',email_verified:true,sub:'gmail-sub'};
  b.call(b.admin,'saveUser',{email:identity.email,name:'Gmail 同事',department:'',role:'member',active:false});
  assert.throws(()=>b.api({action:'login',challenge:challenge(),code:'code'}),/沒有填寫權限/);
});

test('bridge authenticates origin, source and channel before calling the public API',()=>{
  const html=readFileSync(new URL('../apps-script/Bridge.html',import.meta.url),'utf8');
  const source=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= channelJson ?>',JSON.stringify('a'.repeat(32))).replace('<?!= originJson ?>',JSON.stringify('https://example.github.io'));
  let listener,requests=0;const top={postMessage:()=>{}};const runner={withSuccessHandler(){return this;},withFailureHandler(){return this;},api(){requests++;}};
  const context=vm.createContext({window:{top,addEventListener:(_,fn)=>listener=fn},google:{script:{run:runner}}});vm.runInContext(source,context);
  const m={protocol:'trip-poll-v2',channel:'a'.repeat(32),type:'request',id:'1',request:{action:'load'}};
  listener({source:top,origin:'https://evil.invalid',data:m});listener({source:{},origin:'https://example.github.io',data:m});listener({source:top,origin:'https://example.github.io',data:{...m,channel:'bad'}});assert.equal(requests,0);
  listener({source:top,origin:'https://example.github.io',data:m});assert.equal(requests,1);
});
