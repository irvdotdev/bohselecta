import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { defaults, catalogModel } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { handleNativeHook, validateHook, nativeModels, type HookInput } from '../src/native.ts';
import { installHooks, eventsFor } from '../src/native-install.ts';
import { observeModel, readModel } from '../src/native-model.ts';
import type { Provider } from '../src/types.ts';

const hook = fileURLToPath(new URL('../bin/bohselecta-hook.js', import.meta.url));
const prompt = 'Fix the typo in the README heading';
const ids = { codex: ['gpt-6-luna','gpt-6-sol','gpt-6-astra'], claude: ['haiku','sonnet','opus'] };
function fixture(t: TestContext, provider: Provider = 'codex') {
  const home = mkdtempSync(join(tmpdir(),'bohselecta-native-'));
  const config = structuredClone(defaults);
  const models = ids[provider].map(id=>catalogModel(provider,id,id,['low','medium','high'],config)!);
  writeFileSync(join(home,'native-catalog.json'),JSON.stringify({ version:1,providers:{[provider]:{checkedAt:new Date().toISOString(),models}} }));
  const store = new Store(home,0);
  t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});
  const run = (input: Partial<HookInput> = {}) => handleNativeHook(provider,validateHook({session_id:'session',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt,model:ids[provider][2],...input}),config,store,home);
  return {home,store,config,run,models};
}

test('native hook blocks a clear downgrade once, recognises switch, and records completion', t=>{
  const {run,store}=fixture(t);
  const first=run(); assert.equal(first.decision,'block');assert.match(first.reason!,/\/model → select gpt-6-luna/);
  const task=store.recent()[0];assert.equal(task.status,'awaiting-switch');assert.equal(task.result,undefined);
  const repeat=run({model:'gpt-6-luna'});assert.equal(repeat.decision,undefined);assert.match(repeat.systemMessage!,/Switch recognised/);
  assert.equal(store.recent().length,1);assert.equal(store.task(task.id)?.native?.decision,'switched');
  run({hook_event_name:'Stop',model:'gpt-6-luna',last_assistant_message:'Fixed the heading.'});
  const finished=store.task(task.id)!;assert.equal(finished.result?.status,'completed');assert.equal(finished.result?.modelEvidence,'configuration');
  assert.deepEqual(finished.result?.actualModels,[]);assert.equal(finished.result?.configuredModel,'gpt-6-luna');
  run({hook_event_name:'Stop',model:'gpt-6-luna'});assert.equal(store.sessions()[0].native?.completedCount,1);
});
test('resubmitting unchanged respects keeping the expensive model without looping',t=>{
  const {run,store}=fixture(t);run();assert.equal(run().decision,undefined);
  assert.equal(store.recent()[0].native?.decision,'kept');assert.equal(store.recent()[0].choice?.model.id,'gpt-6-astra');
});
test('Claude uses SessionStart and PostModelSwitch instead of guessing from old assistant messages',t=>{
  const {run,store}=fixture(t,'claude');
  run({hook_event_name:'SessionStart',model:'claude-opus-5-5'});
  const r=run({model:undefined});assert.equal(r.decision,'block');assert.match(r.reason!,/\/model haiku/);
  run({hook_event_name:'PostModelSwitch',model:undefined,to_model:'claude-haiku-4-5-20251001'});
  assert.match(run({model:undefined}).systemMessage!,/Switch recognised/);
  run({hook_event_name:'Stop',model:undefined});assert.equal(store.recent()[0].result?.configuredModel,'haiku');
});
test('missing model is never assumed to be the most expensive model',t=>{
  const {run,store}=fixture(t,'claude');assert.deepEqual(run({model:undefined}),{});
  run({hook_event_name:'Stop',model:undefined});assert.equal(store.recent()[0].result?.modelEvidence,'unavailable');
});
test('already suitable cheapest model proceeds quietly; uncertain new work offers options and follow-ups stay put',t=>{
  const {run}=fixture(t);
  assert.deepEqual(run({model:'gpt-6-luna'}),{});
  run({hook_event_name:'Stop',model:'gpt-6-luna'});
  assert.equal(run({prompt:'Add a search feature',model:'gpt-6-astra'}).decision,'block');
  assert.deepEqual(run({prompt:'continue',model:'gpt-6-astra'}),{});
});
test('risk upgrades happen before execution and preserve two meaningful options when uncertain',t=>{
  const {run}=fixture(t);
  const risky=run({prompt:'Audit the authentication system',model:'gpt-6-luna'});
  assert.equal(risky.decision,'block');assert.match(risky.reason!,/gpt-6-astra/);
  const uncertain=run({prompt:'Add a search feature',model:'gpt-6-luna'});
  assert.equal(uncertain.decision,'block');assert.match(uncertain.reason!,/gpt-6-sol/);assert.match(uncertain.reason!,/2\. gpt-6-astra/);
});
test('stale or missing catalog advises without blocking or claiming availability',t=>{
  const {home,run}=fixture(t);rmSync(join(home,'native-catalog.json'));
  const r=run();assert.equal(r.decision,undefined);assert.match(r.systemMessage!,/availability not checked/);
});
test('advisory mode never pauses tasks, and off mode never records prompts',t=>{
  const {config,run,store}=fixture(t);config.native={mode:'advisory'};
  assert.equal(run().decision,undefined);assert.match(run({prompt:'Fix another typo'}).systemMessage!,/task is continuing/);
  const count=store.recent().length;config.native.mode='off';run({prompt:'Private prompt while disabled'});assert.equal(store.recent().length,count);
});
test('local controls pause, resume, and collect feedback without invoking the model',t=>{
  const {run,store}=fixture(t);
  assert.match(run({prompt:'bohselecta: feedback good'}).reason!,/No finished/);
  assert.equal(run({prompt:'bohselecta: off'}).decision,'block');assert.deepEqual(run(),{});assert.equal(store.recent().length,0);
  run({prompt:'bohselecta: on'});run({model:'gpt-6-luna'});run({hook_event_name:'Stop',model:'gpt-6-luna'});
  assert.match(run({prompt:'bohselecta: feedback stronger'}).reason!,/Saved/);
  assert.equal(store.recent()[0].feedback,'stronger');
  const raised=run({model:'gpt-6-luna'});assert.equal(raised.decision,'block');assert.match(raised.reason!,/gpt-6-sol/);
});
test('feedback reminders are optional, periodic, and never block Stop',t=>{
  const {run,config}=fixture(t);config.feedbackEvery=1;
  run({model:'gpt-6-luna'});const r=run({hook_event_name:'Stop',model:'gpt-6-luna'});
  assert.equal(r.decision,undefined);assert.match(r.systemMessage!,/feedback good/);
});
test('failures, interruptions, and model changes are not labelled successful execution evidence',t=>{
  const {run,store}=fixture(t,'claude');
  run({model:'haiku'});run({hook_event_name:'StopFailure',model:'haiku',error:'rate_limit'});
  assert.equal(store.recent()[0].result?.status,'failed');
  run({model:'haiku',prompt:'Fix a different typo'});run({hook_event_name:'PostModelSwitch',model:undefined,to_model:'sonnet'});run({hook_event_name:'Stop',model:undefined});
  assert.equal(store.recent()[0].result?.modelEvidence,'unavailable');
  run({model:'haiku',prompt:'Rename the title'});run({hook_event_name:'SessionEnd',model:'haiku'});assert.equal(store.recent()[0].result?.status,'interrupted');
});
test('session identity isolates directory and provider; subagent events are ignored',t=>{
  const {run,store}=fixture(t);run();assert.equal(run({session_id:'another'}).decision,'block');
  assert.equal(run({cwd:'/another-project'}).decision,'block');
  assert.deepEqual(run({agent_id:'subagent'}),{});assert.equal(store.recent().length,3);
});
test('abandoned suggestions and unobserved turns cannot teach success; deletion removes pending state',t=>{
  const {run,store}=fixture(t);run();const old=store.recent()[0];
  run({prompt:'Fix another typo'});assert.equal(store.task(old.id)?.status,'superseded');
  const task=store.recent()[0];store.deleteTask(task.id);assert.equal(store.sessions()[0].native?.pending,undefined);
  assert.equal(run({prompt:'Fix another typo'}).decision,'block');
});
test('long context avoids downgrade churn and hook input validates bounds',t=>{
  const {run}=fixture(t);assert.deepEqual(run({context_tokens:50000}),{});
  assert.throws(()=>validateHook({}),/Missing/);
  assert.throws(()=>validateHook({session_id:'s',cwd:'/tmp',hook_event_name:'UserPromptSubmit',prompt:'x'.repeat(100001)}),/too large/);
});
test('native catalog reapplies local disabled ratings even after discovery',t=>{
  const {home,config}=fixture(t);config.models.codex={'gpt-6-luna':{capability:1,costRank:1,disabled:true}};
  assert.equal(nativeModels(home,'codex',config).models.some(m=>m.id==='gpt-6-luna'),false);
});
test('installation merges existing hooks, is idempotent, and uninstall removes only owned handlers',t=>{
  const {home}=fixture(t);const directory=join(home,'client');mkdirSync(directory);
  const path=join(directory,'settings.json');
  const original={model:'sonnet',permissions:{allow:['Read']},hooks:{UserPromptSubmit:[{matcher:'',hooks:[{type:'command',command:'echo existing',timeout:2}]}]}};
  writeFileSync(path,JSON.stringify(original));
  const installed=installHooks('claude',home,directory);assert.ok(installed.backup);
  assert.deepEqual(JSON.parse(readFileSync(installed.backup!,'utf8')),original);
  const read=()=>JSON.parse(readFileSync(path,'utf8'));
  assert.equal(read().model,'sonnet');assert.equal(read().hooks.UserPromptSubmit.length,2);
  assert.equal(installHooks('claude',home,directory).changed,false);
  const current=read();current.permissions.allow.push('Write');writeFileSync(path,JSON.stringify(current));
  installHooks('claude',home,directory,true);
  const after=read();assert.deepEqual(after.hooks,original.hooks);assert.deepEqual(after.permissions.allow,['Read','Write']);
});
test('dry run does not write and malformed/symlinked settings are not overwritten',t=>{
  const {home}=fixture(t);const directory=join(home,'client');mkdirSync(directory);
  const r=installHooks('codex',home,directory,false,true);assert.equal(r.changed,true);assert.throws(()=>readFileSync(r.path));
  writeFileSync(r.path,'broken JSON');assert.throws(()=>installHooks('codex',home,directory));assert.equal(readFileSync(r.path,'utf8'),'broken JSON');
  rmSync(r.path);const target=join(home,'target');writeFileSync(target,'{}');symlinkSync(target,r.path);
  assert.throws(()=>installHooks('codex',home,directory),/symlink/);assert.equal(readFileSync(target,'utf8'),'{}');
});
test('installed command uses absolute paths and safely quotes apostrophes/spaces',t=>{
  const {home}=fixture(t);const special=join(home,"space and ' quote");mkdirSync(special);
  const result=installHooks('claude',special,special);
  const settings=JSON.parse(readFileSync(result.path,'utf8'));
  assert.deepEqual(Object.keys(settings.hooks),eventsFor('claude'));
  const command=settings.hooks.SessionStart[0].hooks[0].command;
  const env={...process.env};delete env.BOHSELECTA_BYPASS;
  const child=spawnSync('/bin/sh',['-c',command],{input:JSON.stringify({session_id:'s',cwd:'/project',hook_event_name:'SessionStart',model:'sonnet'}),encoding:'utf8',env});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),{});
  assert.doesNotThrow(()=>readFileSync(join(special,'history.sqlite')));
});
test('hook process emits only JSON, skips on malformed input, and never echoes sensitive input',t=>{
  const {home}=fixture(t);
  const env: NodeJS.ProcessEnv={...process.env,BOHSELECTA_HOME:home};delete env.BOHSELECTA_BYPASS;
  const run=(input:string)=>spawnSync(process.execPath,[hook,'codex'],{input,encoding:'utf8',env,timeout:5000});
  const bad=run('private secret invalid json');assert.equal(bad.status,0);assert.deepEqual(JSON.parse(bad.stdout),{});assert.doesNotMatch(bad.stderr,/private secret/);
  const good=run(JSON.stringify({session_id:'process',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt,model:'gpt-6-astra'}));
  assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).decision,'block');
  writeFileSync(join(home,'config.json'),'invalid');const broken=run('{}');assert.deepEqual(JSON.parse(broken.stdout),{});
});

test('unknown-model status gives recovery steps; a model-switch event restores routing',t=>{
  const {run,store}=fixture(t,'claude');
  const waiting=run({model:undefined,prompt:'bohselecta: status'});
  assert.equal(waiting.decision,'block');
  assert.match(waiting.reason!,/suggestions are inactive/);
  assert.ok(waiting.reason!.includes('Run /model'));
  assert.equal(store.recent().length,0);
  run({hook_event_name:'PostModelSwitch',model:undefined,to_model:'claude-opus-5-5'});
  const ready=run({model:undefined,prompt:'bohselecta: status'});
  assert.match(ready.reason!,/current model: claude-opus-5-5/);
  assert.doesNotMatch(ready.reason!,/suggestions are inactive/);
  assert.equal(run({model:undefined}).decision,'block');
});


test('model observations follow a Claude session across folders without sharing task context',t=>{
  const {run,store}=fixture(t,'claude');
  run({hook_event_name:'SessionStart',model:'claude-opus-5-5'});
  const ready=run({cwd:'/project/subfolder',model:undefined,prompt:'bohselecta: status'});
  assert.match(ready.reason!,/current model: claude-opus-5-5/);
  run({cwd:'/elsewhere',hook_event_name:'PostModelSwitch',model:undefined,to_model:'haiku'});
  assert.match(run({model:undefined,prompt:'bohselecta: status'}).reason!,/current model: haiku/);
  assert.equal(store.recent().length,0);
  assert.match(run({session_id:'different',model:undefined,prompt:'bohselecta: status'}).reason!,/suggestions are inactive/);
});

test('status-line observations repair missing startup data and expired observations do not guess',t=>{
  const {run,store,config,home}=fixture(t,'claude');
  run({hook_event_name:'SessionStart',model:undefined});
  observeModel(store,'claude','session','claude-opus-5-5','statusline');
  assert.match(run({model:undefined,prompt:'bohselecta: status'}).reason!,/current model: claude-opus-5-5/);
  assert.equal(run({model:undefined}).decision,'block');
  observeModel(store,'claude','session','haiku','statusline');
  assert.match(run({model:undefined}).systemMessage!,/Switch recognised/);
  const future=Date.now()+2*86400000;
  const expired=handleNativeHook('claude',{session_id:'session',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt:'bohselecta: status'},config,store,home,future);
  assert.match(expired.reason!,/suggestions are inactive/);
});

test('model observations reject older callbacks and missing startup resets old observations',t=>{
  const {store,config,home}=fixture(t,'claude');const now=Date.now();
  observeModel(store,'claude','session','haiku','statusline',now);
  observeModel(store,'claude','session','opus','hook',now-100);
  assert.equal(readModel(store,'claude','session')?.model,'haiku');
  const start={session_id:'session',cwd:'/project',hook_event_name:'SessionStart',source:'resume'};
  handleNativeHook('claude',start,config,store,home,now+1);
  assert.equal(readModel(store,'claude','session')?.model,'haiku');
  handleNativeHook('claude',start,config,store,home,now+6000);
  assert.equal(readModel(store,'claude','session')?.model,undefined);
});

test('installed status line records the model, preserves custom stdin/output, and restores configuration',t=>{
  const {home,store,run}=fixture(t,'claude');const directory=join(home,'client');mkdirSync(directory);
  const path=join(directory,'settings.json');
  const original={statusLine:{type:'command',command:'cat',padding:3,refreshInterval:12},model:'sonnet'};
  writeFileSync(path,JSON.stringify(original));installHooks('claude',home,directory);
  const settings=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(settings.statusLine.padding,3);assert.equal(settings.statusLine.refreshInterval,12);
  assert.equal(installHooks('claude',home,directory).changed,false);
  const env={...process.env};delete env.BOHSELECTA_BYPASS;
  const input=JSON.stringify({session_id:'session',model:{id:'claude-opus-5-5'},private_field:'not stored',cwd:'/project'});
  const child=spawnSync('/bin/sh',['-c',settings.statusLine.command],{input,encoding:'utf8',env,timeout:6000});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,input);
  assert.equal(readModel(store,'claude','session')?.model,'claude-opus-5-5');
  assert.match(run({model:undefined,prompt:'bohselecta: status'}).reason!,/current model: claude-opus-5-5/);
  assert.doesNotMatch(JSON.stringify(store.db.prepare('SELECT * FROM meta').all()),/not stored/);
  installHooks('claude',home,directory,true);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),original);
});

test('default footer handles invalid data and uninstall preserves later user replacements',t=>{
  const {home}=fixture(t,'claude');const directory=join(home,'client');
  const installed=installHooks('claude',home,directory);const path=installed.path;
  const settings=JSON.parse(readFileSync(path,'utf8'));
  const env={...process.env};delete env.BOHSELECTA_BYPASS;
  const child=spawnSync('/bin/sh',['-c',settings.statusLine.command],{input:'private malformed input',encoding:'utf8',env,timeout:5000});
  assert.equal(child.status,0);assert.match(child.stdout,/waiting for model/);assert.doesNotMatch(child.stderr+child.stdout,/private malformed/);
  installHooks('claude',home,directory,true);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{});
  installHooks('claude',home,directory);
  const changed=JSON.parse(readFileSync(path,'utf8'));changed.statusLine={type:'command',command:'echo new footer'};writeFileSync(path,JSON.stringify(changed));
  installHooks('claude',home,directory,true);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')).statusLine,changed.statusLine);
});


test('todo app offers Sonnet and Opus before execution; keeping Opus is not recorded as a switch',t=>{
  const {run,store}=fixture(t,'claude');
  run({hook_event_name:'SessionStart',model:'claude-opus-5-5'});
  const result=run({prompt:'todo app',model:undefined,prompt_id:'first'});
  assert.equal(result.decision,'block');
  assert.match(result.reason!,/scope is uncertain/);
  assert.match(result.reason!,/\/model sonnet/);assert.match(result.reason!,/\/model opus/);
  assert.doesNotMatch(result.reason!,/lighter model should be enough/);
  const task=store.recent()[0];assert.equal(task.status,'awaiting-switch');
  assert.equal(task.recommendation.analysis.confidence,0.6);
  assert.equal(run({prompt:'todo app',model:undefined,prompt_id:'first'}).decision,'block');
  const kept=run({prompt:'todo app',model:undefined,prompt_id:'second'});
  assert.equal(kept.decision,undefined);assert.doesNotMatch(kept.systemMessage!,/Switch recognised/);
  assert.equal(store.task(task.id)?.native?.decision,'kept');
  assert.equal(store.task(task.id)?.choice?.model.id,'opus');
});

test('uncertain task recognises a Sonnet switch, while advisory and unknown models do not block',t=>{
  const {run,store,config}=fixture(t,'claude');
  run({prompt:'todo app',model:'opus'});
  run({hook_event_name:'PostModelSwitch',model:undefined,to_model:'claude-sonnet-4-6'});
  const switched=run({prompt:'todo app',model:undefined});
  assert.match(switched.systemMessage!,/Switch recognised/);
  assert.equal(store.recent()[0].native?.decision,'switched');
  assert.equal(store.recent()[0].choice?.model.id,'sonnet');
  config.native={mode:'advisory'};
  const advice=run({prompt:'todo app',model:'opus',session_id:'advisory'});
  assert.equal(advice.decision,undefined);assert.match(advice.systemMessage!,/scope is uncertain/);
  assert.match(advice.systemMessage!,/task is continuing/);
  assert.deepEqual(run({prompt:'todo app',model:undefined,session_id:'unknown'}),{});
  assert.deepEqual(run({prompt:'todo app',model:'opus',session_id:'long',context_tokens:50000}),{});
});
