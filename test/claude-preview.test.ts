import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {defaults,catalogModel} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {routePreview,claimPreview,previewState,previewLifecycle} from '../src/claude-preview.ts';
function fixture(t:TestContext){
 const home=mkdtempSync(join(tmpdir(),'bohselecta-preview-')),config=structuredClone(defaults);
 const models=['haiku','sonnet','opus'].map(id=>catalogModel('claude',id,id,[],config));
 writeFileSync(join(home,'native-catalog.json'),JSON.stringify({version:1,providers:{claude:{checkedAt:new Date().toISOString(),models}}}));
 const store=new Store(home,0);t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});
 const input={session_id:'s',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt:'todo app',model:'opus'};
 const run=(overrides:Record<string,unknown>={})=>routePreview({...input,...overrides},config,store,home);
 return {home,config,store,input,run};
}
test('one command chooses either offered model and claims the original task once',t=>{
 const {run,store}=fixture(t);const output=run();
 assert.equal(output.continue,false);assert.match(output.stopReason!,/\/boh:sonnet/);assert.match(output.stopReason!,/\/boh:opus/);
 const task=store.recent()[0];assert.equal(task.status,'awaiting-continuation');assert.equal(task.choice,undefined);
 assert.deepEqual(run(),output);assert.equal(store.recent().length,1);
 assert.throws(()=>claimPreview(store,'other','/project','sonnet'));
 assert.throws(()=>claimPreview(store,'s','/other','sonnet'));
 assert.throws(()=>claimPreview(store,'s','/project','haiku'));
 assert.equal(JSON.parse(claimPreview(store,'s','/project','opus')).originalUserRequest,'todo app');
 assert.equal(store.task(task.id)?.choice?.model.id,'opus');
 assert.throws(()=>claimPreview(store,'s','/project','opus'));
 previewLifecycle({session_id:'s',cwd:'/project',hook_event_name:'Stop',last_assistant_message:'done',model:'opus'},store);
 assert.equal(store.task(task.id)?.result?.modelEvidence,'unavailable');assert.deepEqual(store.task(task.id)?.result?.actualModels,[]);
});
test('suitable Sonnet tasks proceed quietly; narrow tasks offer only Haiku',t=>{
 const {run,store}=fixture(t);
 assert.deepEqual(run({model:'sonnet'}),{});assert.equal(store.recent()[0].choice?.model.id,'sonnet');
 const output=run({session_id:'b',prompt:'Fix the typo in the README heading'});
 assert.match(output.stopReason!,/\/boh:haiku/);assert.doesNotMatch(output.stopReason!,/\/boh:(sonnet|opus)/);
});
test('keep uses the current model and saved request without changing the configured default',t=>{
 const {run,store}=fixture(t);run();
 const output=run({prompt:'boh: keep'});
 assert.match(String(output.hookSpecificOutput?.additionalContext),/originalUserRequest.*todo app/);
 assert.equal(output.continue,undefined);assert.equal(store.recent()[0].choice?.model.id,'opus');
 assert.equal(run({prompt:'boh: keep'}).continue,false);
});
test('cancel and off discard saved work; other sessions remain independent',t=>{
 const {run,store}=fixture(t);run();run({session_id:'other'});
 run({prompt:'boh: cancel'});assert.equal(previewState(store,'s')?.phase,'cancelled');
 assert.equal(run({prompt:'/boh:sonnet'}).continue,false);
 assert.equal(previewState(store,'other')?.phase,'selected');
 run();run({prompt:'bohselecta: off'});assert.equal(previewState(store,'s')?.paused,true);
 const count=store.recent().length;assert.deepEqual(run(),{});assert.equal(store.recent().length,count);
 run({prompt:'boh: on'});assert.equal(run().continue,false);
});
test('pending tasks expire, deleted tasks cannot be claimed, and payload stays data',t=>{
 const {run,store}=fixture(t);
 run({prompt:'Build a todo app with title `$(touch /tmp/should-not-exist)` and "quotes"'});
 const state=previewState(store,'s')!;
 assert.throws(()=>claimPreview(store,'s','/project','sonnet',state.at+86400000));
 const data=JSON.parse(claimPreview(store,'s','/project','sonnet'));assert.match(data.originalUserRequest,/touch/);
 run();store.deleteTask(previewState(store,'s')!.taskId!);
 assert.throws(()=>claimPreview(store,'s','/project','sonnet'));
});
test('unknown availability stops preview; permission restrictions filter haiku; automatic skills denied',t=>{
 const {run,store,home}=fixture(t);
 const output=run({prompt:'Fix the typo in the README heading',permission_mode:'auto'});
 assert.doesNotMatch(output.stopReason??'',/boh:haiku/);
 const denied=previewLifecycle({session_id:'s',cwd:'/project',hook_event_name:'PreToolUse',tool_name:'Skill',tool_input:{skill:'boh:sonnet'}},store);
 assert.equal(denied.hookSpecificOutput?.permissionDecision,'deny');
 assert.equal(run({session_id:'no-pending',prompt:'/boh:sonnet'}).continue,false);
 rmSync(join(home,'native-catalog.json'));assert.match(run({session_id:'missing'}).stopReason!,/Refresh/);
});
test('direct skill supplies saved context without repeated execution or shell grants',t=>{
 const {run,store}=fixture(t);run();const output=run({prompt:'/boh:sonnet'});
 assert.match(String(output.hookSpecificOutput?.additionalContext),/originalUserRequest.*todo app/);
 assert.equal(output.continue,undefined);assert.equal(store.recent()[0].choice?.model.id,'sonnet');
 assert.equal(run({prompt:'/boh:sonnet'}).continue,false);assert.equal(store.recent().length,1);
});
test('continuation refuses extra arguments and a newly incompatible permission mode',t=>{
 const {run}=fixture(t);run({prompt:'Fix the typo in the README heading'});
 assert.equal(run({prompt:'/boh:haiku changed request'}).continue,false);
 assert.equal(run({prompt:'/boh:haiku',permission_mode:'plan'}).continue,false);
});
test('local command hook works without MCP and stops on malformed input or broken config',t=>{
 const {home,input}=fixture(t);
 const invoke=(value:string)=>spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',new URL('../prototypes/claude-native/hook.mjs',import.meta.url).pathname],{env:{...process.env,BOHSELECTA_HOME:home},input:value,encoding:'utf8',timeout:5000});
 const first=invoke(JSON.stringify(input));assert.equal(first.status,0);assert.equal(JSON.parse(first.stdout).continue,false);
 const next=invoke(JSON.stringify({...input,prompt:'/boh:sonnet'}));assert.match(JSON.parse(next.stdout).hookSpecificOutput.additionalContext,/todo app/);
 const duplicate=invoke(JSON.stringify({...input,prompt:'/boh:sonnet'}));assert.equal(JSON.parse(duplicate.stdout).continue,false);
 const broken=invoke('private malformed value');assert.equal(JSON.parse(broken.stdout).continue,false);assert.doesNotMatch(broken.stdout+broken.stderr,/private malformed/);
 writeFileSync(join(home,'config.json'),'invalid');assert.equal(JSON.parse(invoke(JSON.stringify(input)).stdout).continue,false);
});
test('new prompts supersede saved work; explicit commands cannot run an abandoned request',t=>{
 const {run,store}=fixture(t);run();const old=store.recent()[0];
 run({prompt:'Audit the authentication system',model:'haiku'});assert.equal(store.task(old.id)?.status,'superseded');
 assert.equal(run({prompt:'/boh:sonnet'}).continue,false);
 const output=run({prompt:'/boh:opus'});assert.match(String(output.hookSpecificOutput?.additionalContext),/Audit the authentication/);
});
