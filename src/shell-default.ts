import {existsSync,readFileSync,writeFileSync,lstatSync,renameSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Terminal} from './terminal.ts';

const start='# >>> bohselecta claude default >>>';
const end='# <<< bohselecta claude default <<<';
export const shellBlock=`${start}
# Plain interactive claude uses bohselecta; arguments and scripts use Claude directly.
claude() {
  if [ "$#" -eq 0 ] && [ -t 0 ] && [ -t 1 ] && command -v bohselecta >/dev/null 2>&1; then
    command bohselecta popup claude
  else
    command claude "$@"
  fi
}
${end}\n`;
export function shellFiles(home=homedir(),shell=process.env.SHELL||'',zdotdir=process.env.ZDOTDIR):string[] {
 const name=basename(shell);
 if(name==='zsh')return [join(zdotdir?resolve(zdotdir):home,'.zshrc')];
 if(name==='bash')return [join(home,'.bashrc'),join(home,['.bash_profile','.bash_login','.profile'].find(f=>existsSync(join(home,f)))||'.bash_profile')];
 throw Error('Default setup supports zsh and bash. Use bohselecta popup claude in this shell.');
}
function document(path:string) {
 let stat;
 try {stat=lstatSync(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {raw:'',mode:0o600,existed:false};throw error;}
 if(!stat.isFile() || stat.isSymbolicLink())throw Error(`Refusing to edit a linked or non-regular shell profile: ${path}`);
 return {raw:readFileSync(path,'utf8'),mode:stat.mode&0o777,existed:true};
}
function splitBlock(raw:string) {
 const a=raw.indexOf(start),b=raw.indexOf(end);
 if(a===-1 && b===-1)return {before:raw,after:'',installed:false};
 if(a<0 || b<a || raw.indexOf(start,a+1)>=0 || raw.indexOf(end,b+1)>=0)throw Error('The bohselecta shell block is incomplete or duplicated; fix its markers before running setup.');
 const finish=b+end.length+(raw[b+end.length]==='\n'?1:0);
 if(raw.slice(a,finish)!==shellBlock)throw Error('The bohselecta shell block was edited. Remove it manually before running setup again.');
 return {before:raw.slice(0,a),after:raw.slice(finish),installed:true};
}
export function defaultStatus(files:string[]) {
 return files.map(path=>({path,installed:splitBlock(document(path).raw).installed}));
}
export function setDefault(files:string[],enable:boolean) {
 // Preflight every file before changing any of them.
 const changes=files.map(path=>{
  const doc=document(path),parts=splitBlock(doc.raw);
  const rest=parts.before+parts.after;
  if(enable && /(?:^|[;\n])\s*(?:alias\s+claude=|(?:function\s+)?claude\s*\(\)|function\s+claude\b)/m.test(rest))throw Error(`An existing claude shortcut is defined in ${path}. Remove it yourself before enabling the default.`);
  const next=enable ? (parts.installed?doc.raw:doc.raw+(doc.raw.endsWith('\n')||!doc.raw?'':'\n')+shellBlock) : rest;
  return {path,...doc,next};
 }).filter(x=>x.next!==x.raw);
 const done:typeof changes=[];
 try {
  for(const change of changes) {
   const fresh=document(change.path);
   if(fresh.raw!==change.raw || fresh.existed!==change.existed)throw Error('Shell profile changed during setup. Please retry.');
   if(change.existed)writeFileSync(`${change.path}.bohselecta-backup-${randomUUID()}`,change.raw,{mode:change.mode,flag:'wx'});
   const temp=`${change.path}.bohselecta-${randomUUID()}.tmp`;
   try {writeFileSync(temp,change.next,{mode:change.mode,flag:'wx'});renameSync(temp,change.path);done.push(change);}
   finally {if(existsSync(temp))unlinkSync(temp);}
  }
 }catch(error) {
  for(const change of done.reverse())if(readFileSync(change.path,'utf8')===change.next) {
   if(change.existed)writeFileSync(change.path,change.raw,{mode:change.mode});else unlinkSync(change.path);
  }
  throw error;
 }
 return changes.map(x=>x.path);
}
export async function defaultCli(action:string,interactive=false) {
 const files=shellFiles();
 if(action==='status') {for(const s of defaultStatus(files))console.log(`${s.installed?'Enabled':'Not enabled'}: ${s.path}`);return;}
 if(!['on','off'].includes(action))throw Error('Use bohselecta default claude on | off | status.');
 if(interactive) {
  if(!process.stdin.isTTY || !process.stdout.isTTY)throw Error('Run bohselecta setup claude in a terminal, or explicitly use bohselecta default claude on.');
  if(defaultStatus(files).every(s=>s.installed)){console.log('Already enabled. Open a new terminal and type claude.');return;}
  const terminal=new Terminal(),controller=new AbortController();terminal.onInterrupt=()=>controller.abort();
  try {
   terminal.notice(`Enable bohselecta whenever you type claude?\nEdits ${files.join(' and ')} with a backed-up, removable shell shortcut.\nCommands with arguments (including --resume) and non-interactive calls keep using ordinary Claude.`);
   const answer=await terminal.ask('Enable? [y/N] ',controller.signal);
   if(!/^y(?:es)?$/i.test(answer.trim())){console.log('Unchanged. Start with bohselecta popup claude when you want the chooser.');return;}
  }catch(error){if(controller.signal.aborted){console.log('Setup cancelled; shell profiles unchanged.');return;}throw error;}
  finally{terminal.close();}
 }
 const changed=setDefault(files,action==='on');
 console.log(action==='on'?'Enabled. Open a new terminal, then type claude.\nUndo: bohselecta default claude off':'Disabled. Open a new terminal, or run: unset -f claude');
 if(changed.length)console.log(`Updated: ${changed.join(', ')}`);
}
