import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compatibleNode,verify,install} from '../scripts/install.mjs';
test('installer requires a Node version with supported TypeScript loading',()=>{
 for(const version of ['22.18.0','22.20.0','24.0.0','26.6.0'])assert.ok(compatibleNode(version));
 for(const version of ['20.19.0','22.17.0','23.11.0'])assert.equal(compatibleNode(version),false);
});
test('installer rejects corrupted, missing and mismatched release checksums',()=>{
 const bytes=Buffer.from('release'),sums=createHash('sha256').update(bytes).digest('hex')+'  source.tar.gz\n';
 verify(bytes,'source.tar.gz',sums);
 assert.throws(()=>verify(Buffer.from('corrupt'),'source.tar.gz',sums),/Checksum/);
 assert.throws(()=>verify(bytes,'popup',sums),/Checksum/);
 assert.throws(()=>verify(bytes,'source.tar.gz','not-a-hash  source.tar.gz'),/Checksum/);
});
test('installer refuses unrelated commands without modifying them',async t=>{
 const prefix=mkdtempSync(join(tmpdir(),'boh-install-conflict-'));t.after(()=>rmSync(prefix,{recursive:true,force:true}));
 mkdirSync(join(prefix,'bin'));writeFileSync(join(prefix,'bin/bohselecta'),'existing command');
 await assert.rejects(install({prefix,base:'http://127.0.0.1:1'}),/Refusing to replace/);
 assert.equal(readFileSync(join(prefix,'bin/bohselecta'),'utf8'),'existing command');
});
test('installer rejects unsupported platforms and insecure release servers before downloading',async()=>{
 await assert.rejects(install({platform:'win32'}),/supports macOS and Linux/);
 await assert.rejects(install({base:'http://example.com'}),/require HTTPS/);
});
