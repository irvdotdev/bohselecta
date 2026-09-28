import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../bin/bohselecta.js',import.meta.url));
test('CLI emits machine-readable recommendations and saves history without live clients',t=>{
  const home=mkdtempSync(join(tmpdir(),'bohselecta-cli-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const run=(...args:string[])=>execFileSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8'});
  const task=JSON.parse(run('recommend','codex','Rename the README title','--offline','--json'));
  assert.equal(task.status,'recommended');assert.equal(task.recommendation.choices[0].model.id,'gpt-6-luna');
  assert.equal(JSON.parse(run('history','--json')).length,1);
  const blocked=spawnSync(process.execPath,[cli,'history','clear','--home',home],{encoding:'utf8'});
  assert.equal(blocked.status,1); assert.match(blocked.stderr,/--yes/);
  run('history','clear','--yes'); assert.equal(JSON.parse(run('history','--json')).length,0);
});
test('CLI rejects offline execution and invalid choices',()=>{
  const home=mkdtempSync(join(tmpdir(),'bohselecta-cli-'));
  try {
    for(const args of [['codex','--offline'],['codex','--choose','9']]) {
      const r=spawnSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8'}); assert.equal(r.status,1);
    }
  } finally {rmSync(home,{recursive:true,force:true});}
});
