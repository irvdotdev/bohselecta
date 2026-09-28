import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults, loadConfig, catalogModel } from '../src/config.ts';
import { classify, recommend } from '../src/router.ts';
import { Store, type Task } from '../src/store.ts';
import { executeTask } from '../src/engine.ts';
import { refineAnalysis } from '../src/classifier.ts';
import type { Adapter, IO, Model, RunResult } from '../src/types.ts';

const models = ['gpt-6-luna','gpt-6-sol','gpt-6-astra'].map(id => catalogModel('codex',id,id,['low','medium','high'],defaults)!);
const prompt = 'Fix the typo in the README heading';
function fixture(t: any) {
  const home = mkdtempSync(join(tmpdir(),'bohselecta-test-'));
  const store = new Store(home,0);
  t.after(() => { store.close(); rmSync(home,{recursive:true,force:true}); });
  return { home, store };
}
test('narrow tasks choose only the inexpensive model', () => {
  for (const text of [prompt,'Rename the button label to Save','Fix a typo']) {
    const r = recommend({prompt:text,models});
    assert.equal(r.choices.length,1); assert.equal(r.choices[0].model.id,'gpt-6-luna'); assert.equal(r.choices[0].effort,'low');
  }
});
test('uncertain work offers exactly two ranked alternatives', () => {
  const r = recommend({prompt:'Add a search feature to this repository',models});
  assert.deepEqual(r.choices.map(c=>c.model.id),['gpt-6-sol','gpt-6-astra']);
});
test('high-consequence work cannot be routed to the cheap tier', () => {
  for (const text of ['Investigate a production database migration','Find the root cause of a distributed race condition','Review authentication and authorization']) {
    const r = recommend({prompt:text,models}); assert.equal(r.choices[0].model.id,'gpt-6-astra');
  }
});
test('follow-ups preserve difficulty from context', () => {
  assert.equal(classify('implement that','Design a distributed payment system').difficulty,3);
  assert.ok(classify('do it').confidence < 0.8);
});
test('explicit model override is respected, but not invented', () => {
  assert.equal(recommend({prompt,models,override:'gpt-6-astra'}).source,'override');
  assert.throws(()=>recommend({prompt,models,override:'not-real'}),/not in/);
});
test('unrated models require an override and unavailable models cannot win', () => {
  const unknown = catalogModel('codex','future-model','Future',[],defaults)!;
  assert.throws(()=>recommend({prompt,models:[unknown]}),/No rated/);
  assert.equal(recommend({prompt,models:[unknown],override:'future-model'}).choices[0].model.id,'future-model');
  assert.equal(recommend({prompt,models:models.slice(1)}).choices[0].model.id,'gpt-6-sol');
});
test('negative feedback raises capability floor; accepted recommendations alone do not teach', () => {
  const rec = recommend({prompt,models});
  const task: Task = {id:'t',createdAt:new Date().toISOString(),sessionId:'s',provider:'codex',cwd:'/tmp',prompt,context:'',recommendation:rec,choice:rec.choices[0],status:'completed',result:{status:'completed',sessionId:'native',text:'done',actualModels:[],configuredModel:'gpt-6-luna',modelEvidence:'configuration',usage:{}}};
  assert.equal(recommend({prompt,models,history:[task]}).source,'rules');
  task.feedback='good'; assert.equal(recommend({prompt,models,history:[task]}).source,'history');
  task.feedback='stronger'; assert.equal(recommend({prompt,models,history:[task]}).choices[0].model.id,'gpt-6-sol');
  task.feedback='good'; task.result!.status='failed'; assert.equal(recommend({prompt,models,history:[task]}).source,'rules');
});
test('stale catalog and wrong observed model are excluded from learning', () => {
  const rec = recommend({prompt,models});
  const task: Task = {id:'t',createdAt:new Date().toISOString(),sessionId:'s',provider:'codex',cwd:'/tmp',prompt,context:'',recommendation:rec,choice:rec.choices[0],status:'completed',feedback:'good',result:{status:'completed',sessionId:'n',text:'done',actualModels:['other'],modelEvidence:'execution',usage:{}}};
  assert.equal(recommend({prompt,models,history:[task]}).source,'rules');
  task.result!.actualModels=['gpt-6-luna']; task.recommendation.catalogVersion='old';
  assert.equal(recommend({prompt,models,history:[task]}).source,'rules');
});
test('model ranking can be overridden and disabled in config', () => {
  const cfg = structuredClone(defaults); cfg.models.codex={'gpt-6-luna':{capability:1,costRank:1,disabled:true}};
  assert.equal(catalogModel('codex','gpt-6-luna','Luna',[],cfg),null);
});
test('SQLite persists tasks and isolates provider/project history', t => {
  const {store,home}=fixture(t); const s=store.newSession('codex','/project');
  const task:Task={id:'t',createdAt:new Date().toISOString(),sessionId:s.id,provider:'codex',cwd:'/project',prompt,context:'',recommendation:recommend({prompt,models}),status:'recommended'};
  store.save(task); assert.equal(store.recent(10,'codex','/project').length,1);
  assert.equal(store.recent(10,'claude','/project').length,0);
  assert.throws(()=>store.feedback('t','good'),/actually ran/);
  assert.equal(statSync(join(home,'history.sqlite')).mode & 0o777,0o600);
  store.deleteTask('t'); assert.equal(store.recent().length,0);
});
test('classifier budget reserves atomically and survives history clear', t => {
  const {store}=fixture(t);
  assert.equal(store.reserveClassifier('today',0.01,0.025,5),true);
  assert.equal(store.reserveClassifier('today',0.01,0.025,5),true);
  assert.equal(store.reserveClassifier('today',0.01,0.025,5),false);
  store.clear(); assert.equal(store.reserveClassifier('today',0.01,0.025,5),false);
});
test('invalid config is rejected before client startup', t => {
  const {home}=fixture(t); writeFileSync(join(home,'config.json'),JSON.stringify({...defaults,feedbackEvery:-1}));
  assert.throws(()=>loadConfig(home),/feedbackEvery/);
});

function fakeAdapter(calls: string[]): Adapter {
  return {connect:async()=>models,close:async()=>{},run:async(p,c)=>{calls.push(c.model.id);return {status:'completed',sessionId:'native-1',text:'Done',actualModels:[c.model.id],modelEvidence:'execution',usage:{inputTokens:10,outputTokens:2}} satisfies RunResult;}};
}
test('engine gates execution on choice and saves selected model/context', async t => {
  const {store}=fixture(t), session=store.newSession('codex','/project'), calls:string[]=[];
  let asked=false;
  const io:IO={text:()=>{},notice:()=>{},ask:async()=>{assert.equal(calls.length,0);asked=true;return '2';}};
  const task=await executeTask({prompt:'Add a search feature',session,models,adapter:fakeAdapter(calls),store,config:defaults,io,signal:new AbortController().signal});
  assert.ok(asked); assert.deepEqual(calls,['gpt-6-astra']); assert.equal(task.status,'completed');
  assert.equal(store.session(session.id)?.nativeId,'native-1'); assert.match(session.context,/Add a search/);
});
test('engine auto-selects one winner and dry run never invokes agent', async t => {
  const {store}=fixture(t),session=store.newSession('codex','/project'),calls:string[]=[];
  const io:IO={text:()=>{},notice:()=>{},ask:async()=>{throw new Error('must not ask');}};
  const base={prompt,session,models,adapter:fakeAdapter(calls),store,config:defaults,io,signal:new AbortController().signal};
  await executeTask({...base,dryRun:true}); assert.deepEqual(calls,[]);
  await executeTask(base); assert.deepEqual(calls,['gpt-6-luna']);
});
test('invalid/empty choice and abort never execute a task', async t => {
  const {store}=fixture(t),session=store.newSession('codex','/project'),calls:string[]=[];
  const base={prompt:'Add a search feature',session,models,adapter:fakeAdapter(calls),store,config:defaults,signal:new AbortController().signal};
  const io=(answer:string):IO=>({text:()=>{},notice:()=>{},ask:async()=>answer});
  assert.equal((await executeTask({...base,io:io('')})).status,'cancelled');
  await assert.rejects(executeTask({...base,io:io('99')}),/Invalid selection/);
  await assert.rejects(executeTask({...base,prompt,io:io('1'),signal:AbortSignal.abort()}));
  assert.deepEqual(calls,[]);
});
test('client failure and unavailable models are recorded without pretending completion', async t => {
  const {store}=fixture(t),session=store.newSession('codex','/project');
  const io:IO={text:()=>{},notice:()=>{},ask:async()=>''};
  const a=fakeAdapter([]); a.run=async()=>{throw new Error('offline');};
  const base={prompt,session,models,adapter:a,store,config:defaults,io,signal:new AbortController().signal};
  await assert.rejects(executeTask(base),/offline/);
  assert.equal(store.recent()[0].status,'failed');
  await assert.rejects(executeTask({...base,models:[]}),/No rated/);
  assert.equal(store.recent().length,2);
});
test('optional classifier is bounded, validates output, and falls back on errors', async t => {
  const {store}=fixture(t); const key=process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY='test-key';
  t.after(()=>{if(key===undefined) delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;});
  const config={...defaults,classifier:{model:'test-classifier',dailyBudgetUsd:1,inputUsdPerMillion:1,outputUsdPerMillion:1,maxCallsPerDay:2}};
  const a=classify('Add a feature'); let calls=0;
  const fetcher:typeof fetch=async(_url,options)=>{calls++;const b=JSON.parse(options!.body as string);assert.equal(b.max_output_tokens,400);assert.equal(b.store,false);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({category:'coding',difficulty:3,confidence:0.9,reason:'Cross-cutting change'})}]}]}));};
  const result=await refineAnalysis('Add a feature','',a,config,store,new AbortController().signal,fetcher);
  assert.equal(result.analysis.difficulty,3); assert.equal(result.analysis.source,'classifier');
  const bad=await refineAnalysis('Add a feature','',a,config,store,new AbortController().signal,async()=>new Response('bad',{status:503}));
  assert.equal(bad.analysis.source,'rules');assert.match(bad.notice!,/unavailable/);
  const capped=await refineAnalysis('Add a feature','',a,config,store,new AbortController().signal,fetcher);
  assert.match(capped.notice!,/budget/);assert.equal(calls,1);
});
