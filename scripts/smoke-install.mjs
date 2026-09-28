import {createServer} from 'node:http';
import {mkdtempSync, readFileSync, rmSync, writeFileSync, readlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {install,VERSION} from './install.mjs';
const assets=resolve(process.argv[2]||'release'),temp=mkdtempSync(join(tmpdir(),'boh-clean-install-'));
let corrupt=false;
const server=createServer((req,res)=>{
 try {
  const name=basename(new URL(req.url,'http://localhost').pathname);
  res.end(corrupt && name.startsWith('boh-popup-')?Buffer.from('corrupt'):readFileSync(join(assets,name)));
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
 const prefix=join(temp,"prefix with spaces"),base=`http://127.0.0.1:${server.address().port}`;
 const first=await install({prefix,base});
 const run=(...args)=>execFileSync(first.link,args,{encoding:'utf8',env:{...process.env,BOHSELECTA_HOME:join(temp,'data')}}).trim();
 assert.ok(run('--version').endsWith(VERSION));
 assert.equal(JSON.parse(run('recommend','claude','Fix a typo','--offline','--json')).status,'recommended');
 const old=readlinkSync(join(prefix,'share/bohselecta-app/current'));
 corrupt=true;
 await assert.rejects(install({prefix,base}),/Checksum verification failed/);
 assert.equal(readlinkSync(join(prefix,'share/bohselecta-app/current')),old);
 assert.ok(run('--version').endsWith(VERSION));
 corrupt=false;
 const second=await install({prefix,base});
 assert.notEqual(second.release,first.release);
 assert.equal(JSON.parse(run('history','--json')).length,1);
 console.log('PASS: clean install, prebuilt render, CLI routing, spaces in paths, failed-update preservation, reinstall, unchanged history.');
} finally {await new Promise(r=>server.close(r));rmSync(temp,{recursive:true,force:true});}
