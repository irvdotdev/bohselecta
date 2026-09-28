import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaults, catalogModel } from '../src/config.ts';
import { handleNativeHook } from '../src/native.ts';
import { Store } from '../src/store.ts';

test('duplicate delivery cannot bypass a block; later user resubmission can',t=>{
  const home=mkdtempSync(join(tmpdir(),'bohselecta-recovery-'));const store=new Store(home,0);
  t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});
  const models=['gpt-6-luna','gpt-6-sol','gpt-6-astra'].map(id=>catalogModel('codex',id,id,['low','medium','high'],defaults));
  writeFileSync(join(home,'native-catalog.json'),JSON.stringify({version:1,providers:{codex:{checkedAt:new Date().toISOString(),models}}}));
  const input={session_id:'s',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt:'Fix the typo',model:'gpt-6-astra',turn_id:'first'};
  const now=Date.now();
  assert.equal(handleNativeHook('codex',input,defaults,store,home,now).decision,'block');
  assert.equal(handleNativeHook('codex',input,defaults,store,home,now+10).decision,'block');
  assert.equal(handleNativeHook('codex',{...input,turn_id:'resubmission',model:'gpt-6-luna'},defaults,store,home,now+8*3600000).decision,undefined);
  assert.equal(store.recent().length,1);assert.equal(store.recent()[0].native?.decision,'switched');
});

test('SQLite contention and invalid configuration fail open within the hook deadline',t=>{
  const home=mkdtempSync(join(tmpdir(),'bohselecta-recovery-'));const store=new Store(home,0);
  t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});
  const hook=fileURLToPath(new URL('../bin/bohselecta-hook.js',import.meta.url));
  const input=JSON.stringify({session_id:'s',cwd:'/project',hook_event_name:'UserPromptSubmit',prompt:'private testing string',model:'gpt-6-astra'});
  const env:NodeJS.ProcessEnv={...process.env,BOHSELECTA_HOME:home};delete env.BOHSELECTA_BYPASS;
  const run=()=>spawnSync(process.execPath,[hook,'codex'],{input,env,encoding:'utf8',timeout:3000});
  store.db.exec('BEGIN IMMEDIATE');const busy=run();store.db.exec('ROLLBACK');
  assert.equal(busy.status,0);assert.deepEqual(JSON.parse(busy.stdout),{});assert.doesNotMatch(busy.stderr,/private testing string/);
  writeFileSync(join(home,'config.json'),'invalid');const bad=run();assert.equal(bad.status,0);assert.deepEqual(JSON.parse(bad.stdout),{});
});

test('native install and removal work through the public CLI without affecting other client settings',t=>{
  const home=mkdtempSync(join(tmpdir(),'bohselecta-install-cli-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const cli=fileURLToPath(new URL('../bin/bohselecta.js',import.meta.url));
  const run=(...args:string[])=>spawnSync(process.execPath,[cli,...args,'--home',join(home,'data'),'--config-dir',join(home,'client'),'--json'],{encoding:'utf8'});
  const installed=run('install','codex','--offline');assert.equal(installed.status,0,installed.stderr);assert.equal(JSON.parse(installed.stdout)[0].hooks,5);
  const duplicate=run('install','codex','--offline');assert.equal(JSON.parse(duplicate.stdout)[0].changed,false);
  const removed=run('uninstall','codex');assert.equal(removed.status,0,removed.stderr);assert.equal(JSON.parse(removed.stdout)[0].hooks,0);
});
