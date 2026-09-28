import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,symlinkSync,chmodSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {shellFiles,shellBlock,setDefault,defaultStatus} from '../src/shell-default.ts';
function fixture(t:any){const dir=mkdtempSync(join(tmpdir(),'boh-shell-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('default enable is idempotent, backs up profiles, and removal preserves later edits',t=>{
 const dir=fixture(t),file=join(dir,'.zshrc');writeFileSync(file,'export EDITOR=vim\n');
 assert.deepEqual(setDefault([file],true),[file]);assert.equal(defaultStatus([file])[0].installed,true);
 assert.deepEqual(setDefault([file],true),[]);
 const backup=readdirSync(dir).find(f=>f.includes('backup'))!;
 assert.equal(readFileSync(join(dir,backup),'utf8'),'export EDITOR=vim\n');
 writeFileSync(file,readFileSync(file,'utf8')+'export LATER=1\n');setDefault([file],false);
 assert.equal(readFileSync(file,'utf8'),'export EDITOR=vim\nexport LATER=1\n');assert.deepEqual(setDefault([file],false),[]);
});
test('existing shortcuts, edited blocks, malformed markers and symlinks are left untouched',t=>{
 const dir=fixture(t),file=join(dir,'.zshrc');
 for(const text of ['alias claude="custom"\n','claude() { echo custom; }\n','function claude { echo custom; }\n',shellBlock.replace('popup claude','preview claude'),'# >>> bohselecta claude default >>>\n']){
  writeFileSync(file,text);assert.throws(()=>setDefault([file],true));assert.equal(readFileSync(file,'utf8'),text);
 }
 const link=join(dir,'linked');symlinkSync(file,link);assert.throws(()=>setDefault([link],true),/linked/);
 const dangling=join(dir,'dangling');symlinkSync(join(dir,'missing'),dangling);assert.throws(()=>setDefault([dangling],true),/linked/);
});
test('shell file selection respects ZDOTDIR and bash login precedence; preflight protects both files',t=>{
 const dir=fixture(t);assert.deepEqual(shellFiles(dir,'/bin/zsh',join(dir,'custom')),[join(dir,'custom/.zshrc')]);
 writeFileSync(join(dir,'.profile'),'alias claude=custom\n');
 const files=shellFiles(dir,'/bin/bash');assert.deepEqual(files,[join(dir,'.bashrc'),join(dir,'.profile')]);
 assert.throws(()=>setDefault(files,true),/existing claude/);assert.equal(readdirSync(dir).includes('.bashrc'),false);
 assert.throws(()=>shellFiles(dir,'/bin/fish'),/supports zsh and bash/);
});
test('shell shortcut preserves arguments, exit status and ordinary Claude in non-interactive calls',t=>{
 const dir=fixture(t),bin=join(dir,'bin');mkdirSync(bin);
 writeFileSync(join(bin,'claude'),'#!/bin/sh\nprintf "<%s>\\n" "$@"\nexit 7\n');chmodSync(join(bin,'claude'),0o755);
 writeFileSync(join(bin,'bohselecta'),'#!/bin/sh\necho UNEXPECTED_POPUP\n');chmodSync(join(bin,'bohselecta'),0o755);
 const file=join(dir,'profile');writeFileSync(file,shellBlock);
 for(const args of [[],['--resume','two words'],['-p','a; $(not-a-command)']]) {
  try{execFileSync('/bin/bash',['-c','source "$1"; shift; claude "$@"','bash',file,...args],{env:{...process.env,PATH:bin+':'+process.env.PATH},encoding:'utf8'});assert.fail('Expected Claude exit status');}
  catch(error:any){assert.equal(error.status,7);assert.equal(error.stdout,args.length?args.map(a=>`<${a}>\n`).join(''):'<>\n');}
 }
});
