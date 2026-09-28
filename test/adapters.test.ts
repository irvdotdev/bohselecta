import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexAdapter } from '../src/adapters/codex.ts';
import { defaults } from '../src/config.ts';
import type { IO } from '../src/types.ts';
async function setup(t:any,answer='n') {
  const cwd=mkdtempSync(join(tmpdir(),'bohselecta-adapter-'));
  const script=join(cwd,'codex-mock');
  writeFileSync(script,'#!/usr/bin/env node\n'+readFileSync(new URL('./fixtures/codex-server.mjs',import.meta.url),'utf8'),{mode:0o755});
  let questions=0;
  const io:IO={text:()=>{},notice:()=>{},ask:async()=>{questions++;return answer;}};
  const adapter=new CodexAdapter(defaults,cwd,io,undefined,script);
  t.after(async()=>{await adapter.close();rmSync(cwd,{recursive:true,force:true});});
  const models=await adapter.connect();
  return {adapter,models,questions:()=>questions,cwd,script,io};
}
test('Codex changes model per turn and reports per-turn token deltas',async t=>{
  const {adapter,models}=await setup(t);
  const a=await adapter.run('one',{model:models[0],effort:'low',reason:''},new AbortController().signal);
  const b=await adapter.run('two',{model:models[1],effort:'medium',reason:''},new AbortController().signal);
  assert.equal(a.sessionId,b.sessionId);assert.equal(b.configuredModel,'gpt-6-sol');
  assert.equal(a.usage.inputTokens,10);assert.equal(b.usage.inputTokens,10);
  assert.equal(b.modelEvidence,'configuration');assert.deepEqual(b.actualModels,[]);
});
test('Codex approval requests are explicitly allowed or denied',async t=>{
  for(const answer of ['y','n']) {
    const {adapter,models,questions}=await setup(t,answer);
    const r=await adapter.run('approval',{model:models[0],reason:''},new AbortController().signal);
    assert.equal(questions(),1);assert.equal(r.text,answer==='y'?'APPROVED':'DENIED');
  }
});
test('Codex cancellation interrupts the actual turn',async t=>{
  const {adapter,models}=await setup(t);const abort=new AbortController();
  const result=adapter.run('wait',{model:models[0],reason:''},abort.signal);
  setTimeout(()=>abort.abort(),50);
  assert.equal((await result).status,'interrupted');
});
test('Codex model mismatch interrupts instead of reporting successful selection',async t=>{
  const {adapter,models}=await setup(t);
  await assert.rejects(adapter.run('mismatch',{model:models[0],reason:''},new AbortController().signal),/model mismatch/);
});
test('Codex backend failure and process death settle the pending task',async t=>{
  const {adapter,models}=await setup(t);
  const r=await adapter.run('fail',{model:models[0],reason:''},new AbortController().signal);
  assert.equal(r.status,'failed');assert.equal(r.error,'Test failure');
  await assert.rejects(adapter.run('crash',{model:models[0],reason:''},new AbortController().signal),/Client exited/);
});
