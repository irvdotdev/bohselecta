import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const archive=resolve(process.argv[2]);
const temp=mkdtempSync(join(tmpdir(),'boh-npm-check-'));
try {
 const prefix=join(temp,'prefix with spaces');
 const env={...process.env,BOHSELECTA_HOME:join(temp,'data'),npm_config_cache:join(temp,'cache')};
 execFileSync('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',archive],{env,stdio:'inherit'});
 const root=join(prefix,'lib/node_modules/bohselecta');
 const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
 const run=(...args)=>execFileSync(join(prefix,'bin/bohselecta'),args,{env,encoding:'utf8'}).trim();
 assert.equal(run('--version'),version);
 assert.equal(JSON.parse(run('recommend','claude','Fix a typo','--offline','--json')).status,'recommended');
 // Import installed JS from node_modules: catches unsupported TypeScript loading and missing assets.
 const {popupBinary}=await import(pathToFileURL(join(root,'src/popup.js')));
 assert.match(popupBinary(root),new RegExp(`boh-popup-${process.platform}-${process.arch}$`));
 assert.match(execFileSync(popupBinary(root),['--self-test'],{encoding:'utf8'}),/render check passed/);
 for(const script of ['bin/bohselecta-hook.js','prototypes/claude-native/hook.mjs']) {
  const output=execFileSync(process.execPath,[join(root,script),...(script.startsWith('bin/')?['claude']:[])],{env,input:JSON.stringify({session_id:'packaging-test',cwd:temp,hook_event_name:'SessionStart',model:'sonnet'}),encoding:'utf8',timeout:15000});
  assert.equal(JSON.parse(output).continue===false,false);
 }
 const npx=execFileSync('npm',['exec','--yes',`--package=${archive}`,'--','bohselecta','--version'],{env,encoding:'utf8'}).trim();
 assert.equal(npx,version);
 console.log('PASS: npm global install, compiled hooks, offline routing, native popup and npx; no install scripts or Rust.');
}finally{rmSync(temp,{recursive:true,force:true});}
