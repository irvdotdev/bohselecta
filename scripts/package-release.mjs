import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {version}=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const output=resolve(process.argv[2] || join(root,'release'));
const temp=mkdtempSync(join(tmpdir(),'boh-release-'));
try {
 const stage=join(temp,'bohselecta');mkdirSync(stage);mkdirSync(output,{recursive:true});
 // Explicit software-only archive: no history, artwork, local settings or build output.
 for(const name of ['package.json','package-lock.json','LICENSE','README.md','CHANGELOG.md','tsconfig.json','tsconfig.build.json','src','bin','docs','prototypes','test','scripts']) {
  cpSync(join(root,name),join(stage,name),{recursive:true,filter:path=>!path.split('/').some(part=>['target','prebuilt','node_modules','.DS_Store'].includes(part))});
 }
 const archive=join(output,`bohselecta-${version}.tar.gz`);
 execFileSync('tar',['-czf',archive,'-C',temp,'bohselecta'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
 cpSync(join(root,'scripts/install.mjs'),join(output,'install.mjs'));
 console.log(archive);
} finally {rmSync(temp,{recursive:true,force:true});}
