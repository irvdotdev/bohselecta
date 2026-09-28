#!/usr/bin/env node
import {createHash, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const VERSION='0.3.0-alpha.3';
export function compatibleNode(version) {
 const [major,minor]=version.split('.').map(Number);
 return major===22 && minor>=18 || major>=24;
}
export function verify(bytes,name,sums) {
 const line=sums.split(/\r?\n/).find(line=>line.endsWith(`  ${name}`));
 if(!line || !/^[a-f0-9]{64}  /.test(line) || createHash('sha256').update(bytes).digest('hex')!==line.slice(0,64))throw Error(`Checksum verification failed for ${name}. Nothing was activated.`);
}
async function download(base,name) {
 const response=await fetch(`${base}/${name}`,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`Download failed (${response.status}): ${name}`);
 return Buffer.from(await response.arrayBuffer());
}
function run(command,args,options={}) {return execFileSync(command,args,{stdio:'inherit',...options});}
export async function install({prefix=join(homedir(),'.local'),base=`https://github.com/irvdotdev/bohselecta/releases/download/v${VERSION}`,platform=process.platform,arch=process.arch}={}) {
 if(!compatibleNode(process.versions.node))throw Error('Use Node.js 22.18+ (22.x), or Node.js 24+. Node 23 is not supported.');
 if(!['darwin-arm64','darwin-x64','linux-x64','linux-arm64'].includes(`${platform}-${arch}`))throw Error('This installer supports macOS and Linux on arm64/x64. Use a source checkout for other platforms.');
 const url=new URL(base);
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Release downloads require HTTPS.');
 run('npm',['--version'],{stdio:'ignore'});run('tar',['--version'],{stdio:'ignore'});
 prefix=resolve(prefix);
 const app=join(prefix,'share/bohselecta-app'),link=join(prefix,'bin/bohselecta'),current=join(app,'current');
 // Never overwrite an unrelated executable or installation.
 for(const [path,target] of [[link,join(current,'bin/bohselecta')],[current,null]]) {
  let stat;try {stat=lstatSync(path);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(stat && (!stat.isSymbolicLink() || (target ? resolve(dirname(path),readlinkSync(path))!==target : !resolve(dirname(path),readlinkSync(path)).startsWith(join(app,'releases')+'/'))))throw Error(`Refusing to replace ${path}. Choose another --prefix or remove the conflicting installation yourself.`);
 }
 mkdirSync(join(app,'releases'),{recursive:true});mkdirSync(dirname(link),{recursive:true});
 const temp=mkdtempSync(join(app,'.install-')),release=join(app,'releases',`${VERSION}-${randomUUID().slice(0,8)}`);
 let activated=false;
 try {
  const source=`bohselecta-${VERSION}.tar.gz`,binary=`boh-popup-${platform}-${arch}`;
  console.log(`Installing bohselecta ${VERSION} for ${platform}/${arch}…`);
  const sums=(await download(base,'SHA256SUMS')).toString('utf8');
  for(const name of [source,binary]) {
   const bytes=await download(base,name);verify(bytes,name,sums);writeFileSync(join(temp,name),bytes);
  }
  const entries=run('tar',['-tzf',join(temp,source)],{encoding:'utf8',stdio:'pipe'}).split('\n').filter(Boolean);
  if(entries.some(name=>!name.startsWith('bohselecta/') || name.split('/').includes('..')))throw Error('Invalid release archive paths.');
  run('tar',['-xzf',join(temp,source),'-C',temp]);
  const stage=join(temp,'bohselecta');
  if(JSON.parse(readFileSync(join(stage,'package.json'),'utf8')).version!==VERSION)throw Error('Release version does not match installer.');
  const prebuilt=join(stage,'prototypes/popup/prebuilt/boh-popup');
  mkdirSync(dirname(prebuilt),{recursive:true});renameSync(join(temp,binary),prebuilt);chmodSync(prebuilt,0o755);
  run('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage});
  const version=run(process.execPath,[join(stage,'bin/bohselecta.js'),'--version'],{encoding:'utf8',stdio:'pipe'}).trim();
  if(!version.endsWith(VERSION))throw Error('Installed command failed its version check.');
  run(prebuilt,['--self-test'],{stdio:'pipe'});
  renameSync(stage,release);
  const next=join(app,`.current-${randomUUID()}`);symlinkSync(release,next);renameSync(next,current);activated=true;
  if(!existsSync(link))symlinkSync(join(current,'bin/bohselecta'),link);
  console.log(`\nInstalled: ${link}\nNo Claude settings or task history were changed.`);
  if(!(process.env.PATH||'').split(':').some(p=>resolve(p)===dirname(link)))console.log(`Add this to your shell profile, then restart your terminal:\nexport PATH=${("'"+dirname(link).replaceAll("'", "'\\''")+"'")}:"$PATH"`);
  console.log('\nNext: bohselecta native refresh claude\n      bohselecta popup claude\nRequires signed-in Claude Code and tmux. See https://irvdotdev.github.io/bohselecta/docs.html#how-to');
  return {link,release};
 } finally {
  rmSync(temp,{recursive:true,force:true});
  if(!activated)rmSync(release,{recursive:true,force:true});
 }
}
if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
 const args=process.argv.slice(2);
 if(args.includes('--help'))console.log('node install.mjs [--prefix PATH]\nInstalls bohselecta under ~/.local by default. No sudo; no shell-profile or client-settings edits.');
 else if(args.length && !(args.length===2 && args[0]==='--prefix')) {console.error('Usage: node install.mjs [--prefix PATH]');process.exitCode=1;}
 else await install(args.length?{prefix:args[1]}:{}).catch(error=>{console.error(`bohselecta installation failed: ${error.message}`);process.exitCode=1;});
}
