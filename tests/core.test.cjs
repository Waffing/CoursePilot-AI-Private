const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function api(){
 const sandbox={URL,AbortController,setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(sandbox);
 for(const name of ['helper-preferences.js','helper-tools.js','request-pacer.js','helper-coordinator.js','helper-answer-retry.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','src',name),'utf8'),sandbox);
 return sandbox;
}
function config(){return{helperPreferences:{theme:'dark'},queryApis:[{provider:'custom',protocol:'chat',url:'https://model.example/v1',token:'TEST_SECRET_KEY',model:'demo',timeout:120}],modelSearch:{token:'SEARCH_TEST_SECRET'},platformParams:{jcedutec:{parts:[{params:[{name:'启用助手',value:true},{name:'视频倍速档位（0为自动）',value:2}]}]}}};}
test('export excludes credentials, URL query and custom prompts',()=>{
 const input=config();input.queryApis[0].url='https://user:password@model.example/v1?key=PRIVATE#fragment';input.queryApis[0].prompt='PRIVATE_PROMPT';
 const result=JSON.stringify(api().createHelperSettingsBackup(input));
 for(const secret of ['TEST_SECRET_KEY','SEARCH_TEST_SECRET','password','PRIVATE','fragment'])assert(!result.includes(secret));
 assert.equal(JSON.parse(result).model.url,'https://model.example/v1');
});
test('import previews changes before application and preserves existing credentials',()=>{
 const helper=api(),input=config(),saved=helper.createHelperSettingsBackup(input);saved.preferences.theme='light';saved.model.model='new-model';saved.model.token='INJECTED';
 const plan=helper.prepareHelperSettingsImport(JSON.stringify(saved),input);
 assert.equal(input.helperPreferences.theme,'dark');assert.equal(plan.changes.length,2);
 plan.apply();assert.equal(input.helperPreferences.theme,'light');assert.equal(input.queryApis[0].model,'new-model');assert.equal(input.queryApis[0].token,'TEST_SECRET_KEY');
});
test('invalid backup and cross-origin credential reuse are rejected',()=>{
 const helper=api(),input=config(),saved=helper.createHelperSettingsBackup(input);
 assert.throws(()=>helper.prepareHelperSettingsImport('{}',input));assert.throws(()=>helper.prepareHelperSettingsImport('x'.repeat(65537),input));
 saved.model.url='https://other.example/v1';assert.throws(()=>helper.prepareHelperSettingsImport(JSON.stringify(saved),input));
});
test('diagnostics hide known keys, bearer tokens, URL credentials and account identifiers',()=>{
 const input=config(),secret='TEST_SECRET_KEY SEARCH_TEST_SECRET Bearer abc123 https://user:password@model.example/v1?token=private 2112355352546476034';
 const result=api().createHelperDiagnostic(input,{label:'error',detail:secret},[{message:secret,time:'12:00'}],new URL('https://site.example/page?id=ACCOUNT'));
 for(const value of ['TEST_SECRET_KEY','SEARCH_TEST_SECRET','abc123','password','private','2112355352546476034','ACCOUNT'])assert(!result.includes(value));
});
test('study recognition diagnostics expose only bounded counts and redacted issues',()=>{
 const input=config(), recognition={source:'visible-dom',questionCount:1,parsedCount:0,optionCounts:[0],issues:['TEST_SECRET_KEY'],title:'PRIVATE_STEM',options:['PRIVATE_OPTION'],html:'PRIVATE_HTML'};
 const result=api().createHelperDiagnostic(input,{label:'需要人工处理',detail:'选项未读取',recognition},[],new URL('https://site.example/page?id=ACCOUNT'));
 const state=JSON.parse(result).state;
 assert.equal(state.recognition.questionCount,1);assert.deepEqual(state.recognition.optionCounts,[0]);
 assert.equal(state.recognition.issues[0],'[已隐藏]');
 for(const value of ['PRIVATE_STEM','PRIVATE_OPTION','PRIVATE_HTML','TEST_SECRET_KEY','ACCOUNT'])assert(!result.includes(value));
});
test('shared request state carries cooldown across independent page pacers',()=>{
 const helper=api(),saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
 const one=helper.createHelperRequestPacer({interval:()=>1000,storage}),two=helper.createHelperRequestPacer({interval:()=>1000,storage});
 one.record({success:false,error:{code:'HTTP_429'},retryAfterSeconds:45});assert(two.remaining()>44000);
});
test('cancelling a queued request prevents reserving another call',async()=>{
 const helper=api(),controller=new AbortController(),pacer=helper.createHelperRequestPacer({interval:()=>1000});
 assert.equal(await pacer.beforeRequest({isCurrent:()=>true}),true);
 const queued=pacer.beforeRequest({signal:controller.signal,isCurrent:()=>true});controller.abort();assert.equal(await queued,false);
});
test('tab ownership waits for claims, transfers explicitly and retains minimal submission records',async()=>{
 const helper=api(),storage=new Map(),listeners=new Map();let id=0;
 const page=()=>({crypto:{randomUUID:()=>String(++id)},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},addEventListener:(event,callback)=>listeners.set(callback,event),removeEventListener:(_,callback)=>listeners.delete(callback)});
 const first=helper.createHelperCoordinator(page()),second=helper.createHelperCoordinator(page());
 try{
  assert.equal(first.isOwner(),false);await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(first.isOwner(),true);assert.equal(second.isOwner(),false);
  assert.equal(first.reserve('question-digest'),true);
  second.takeover();await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(first.isOwner(),false);assert.equal(second.isOwner(),true);assert.equal(second.reserve('question-digest'),false);assert.equal(second.getReceipt('question-digest').status,'pending');
 }finally{first.dispose();second.dispose();}
});
test('a 15-second deadline aborts the pending call and switches to the next configured model',async()=>{
 const sandbox={AbortController,Date,Promise,setInterval,clearInterval,clearTimeout,setTimeout:(callback,ms)=>setTimeout(callback,ms===15000?10:ms)};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','src','helper-answer-retry.js'),'utf8'),sandbox);
 const calls=[];
 const result=await sandbox.queryHelperAnswer({}, {isCurrent:()=>true}, {primary:{model:'primary'},fallback:{model:'backup'},waitSeconds:15,resolve:(_,context)=>{
  calls.push(context);return context.settings.model==='primary'?new Promise(()=>{}):Promise.resolve({success:true});
 }});
 assert.equal(result.success,true);assert.equal(calls.length,2);assert.equal(calls[0].signal.aborted,true);assert.equal(calls[0].isCurrent(),false);
});
test('update manifest is identical to the complete script metadata and points to this GitHub repository',()=>{
 const full=fs.readFileSync(path.join(__dirname,'..','course-helper.user.js'),'utf8');
 const meta=fs.readFileSync(path.join(__dirname,'..','course-helper.meta.js'),'utf8');
 assert.equal(meta.trim(),full.slice(0,full.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length).trim());
 assert.match(meta,/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/Waffing\/CoursePilot-AI-Private\/main\/course-helper\.meta\.js/);
 assert.match(meta,/@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/Waffing\/CoursePilot-AI-Private\/main\/course-helper\.user\.js/);
 assert.match(meta,/@author\s+Waffing/);assert.match(meta,/@namespace\s+noshuang/);
});
test('distribution contains no old notice request or announcement component',()=>{
 const full=fs.readFileSync(path.join(__dirname,'..','course-helper.user.js'),'utf8');
 assert(!full.includes('https://api.tikuhai.com/def/notice'));assert(!full.includes('getNotice'));assert(!full.includes('announcements.value'));
 assert(!/^\/\/ @antifeature\s+ads/m.test(full));
});
