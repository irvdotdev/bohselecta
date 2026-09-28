import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import type {Config} from './config.ts';
import type {HookInput} from './native.ts';
import {nativeModels,resolveCurrent} from './native.ts';
import {readModel} from './native-model.ts';
import {previewState,routePreview,continuation,type PreviewOutput} from './claude-preview.ts';
import type {Store} from './store.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
export function popupBinary(projectRoot=root) {
 const prebuilt=join(projectRoot,'prototypes/popup/prebuilt/boh-popup');
 return existsSync(prebuilt)?prebuilt:join(projectRoot,'prototypes/popup/target/debug/boh-popup');
}
export const tmuxCall=(socket:string,args:string[])=>execFileSync('tmux',['-S',socket,...args],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','pipe']}).trimEnd();
export function readyScreen(screen:string,marker:string):boolean {
 const lines=screen.split('\n');const last=lines.findLastIndex(l=>/^❯/.test(l.trimStart()));
 return last>=0 && /^❯\s*$/.test(lines[last].trim()) && lines.slice(0,last).join(' ').includes(marker);
}
// Screen automation is validated independently from the popup itself.
export const automaticBridgeSupported=(version:string)=>/^2\.1\.(?:282|283)\b/.test(version);
export function popupTarget(clients:string,pane:string) {
 const matches=clients.split('\n').map(line=>line.split('|')).filter(c=>c[1]===pane && c[4]==='0');
 if(matches.length!==1)return undefined;
 const [client,,rawWidth,rawHeight]=matches[0];
 const width=Math.min(76,Number(rawWidth)-2),height=Math.min(20,Number(rawHeight)-2);
 if(!client || !Number.isInteger(width) || !Number.isInteger(height) || width<44 || height<13)return undefined;
 return {client,width,height};
}
export function launchPopup(home:string,cwd:string,model:string) {
 execFileSync('tmux',['-V'],{stdio:'ignore'});
 const binary=popupBinary();
 if(!binary.includes('/prebuilt/') && (!existsSync(binary) || ['src/main.rs','Cargo.toml','Cargo.lock'].some(file=>statSync(join(root,'prototypes/popup',file)).mtimeMs>statSync(binary).mtimeMs))) {
  const build=spawnSync('cargo',['build','--locked','--manifest-path',join(root,'prototypes/popup/Cargo.toml')],{stdio:'inherit'});
  if(build.error || build.status!==0)throw Error('Popup build failed. Install Rust/Cargo, then retry. The plain preview remains available.');
 }
 const version=execFileSync(process.env.BOHSELECTA_CLAUDE_BIN||'claude',['--version'],{encoding:'utf8',timeout:10000}).trim();
 const autoBridge=automaticBridgeSupported(version);
 if(!autoBridge)console.log(`bohselecta · Claude ${version}: popup enabled. After choosing another model, enter the displayed continuation command; automatic handoff is not validated for this version.`);
 const socketName='boh-'+randomUUID().slice(0,8);
 const command=['-L',socketName,'-f','/dev/null'];
 execFileSync('tmux',[...command,'new-session','-d','-s','claude','-c',cwd,
  '-e',`BOHSELECTA_HOME=${home}`,'-e','BOHSELECTA_CLAUDE_PREVIEW=1','-e','BOHSELECTA_POPUP=1',
  '-e',`BOHSELECTA_POPUP_AUTO_BRIDGE=${autoBridge?'1':'0'}`,
  '-e',`BOHSELECTA_CLAUDE_BIN=${process.env.BOHSELECTA_CLAUDE_BIN||'claude'}`,
  process.execPath,join(root,'prototypes/popup/session.mjs'),model],{stdio:'pipe'});
 execFileSync('tmux',['-L',socketName,'set-option','status','off'],{stdio:'ignore'});
 execFileSync('tmux',['-L',socketName,'set-option','focus-events','on'],{stdio:'ignore'});
 const attached=spawnSync('tmux',['-L',socketName,'attach-session','-t','claude'],{stdio:'inherit'});
 if(attached.error)throw attached.error;
 const alive=spawnSync('tmux',['-L',socketName,'has-session','-t','claude'],{stdio:'ignore'});
 if(alive.status===0)console.log(`Claude is still running. Return with: tmux -L ${socketName} attach`);
}
export function popupHook(input:HookInput,output:PreviewOutput,config:Config,store:Store,home:string,selectedBinary=popupBinary()):PreviewOutput {
 if(process.env.BOHSELECTA_POPUP!=='1' || input.agent_id || !output.stopReason || output.continue!==false || input.prompt?.trim().startsWith('/') || /^(boh|bohselecta):/i.test(input.prompt?.trim()??''))return output;
 const state=previewState(store,input.session_id),task=state?.taskId?store.task(state.taskId):undefined;
 if(state?.phase!=='selected' || task?.status!=='awaiting-continuation' || task.prompt!==input.prompt?.trim())return output;
 const unavailable=(reason:string):PreviewOutput=>({...output,stopReason:`${output.stopReason}\nPopup unavailable: ${reason} Your task is saved; use an offered /boh: command.`});
 if(!process.env.TMUX || !process.env.TMUX_PANE)return unavailable('This is not a popup terminal. Start with bohselecta popup claude.');
 const socket=process.env.TMUX.split(',')[0],pane=process.env.TMUX_PANE,owner=Number(process.env.BOHSELECTA_POPUP_OWNER_PID);
 let dir:string|undefined,handedOff=false;
 try {
  const pid=Number(tmuxCall(socket,['display-message','-p','-t',pane,'#{pane_pid}']));
  if(!Number.isInteger(owner) || owner<=0 || pid!==owner)return unavailable('The Claude pane could not be verified. Restart with bohselecta popup claude.');
  if(!existsSync(selectedBinary))return unavailable('The chooser binary is missing. Restart the popup launcher to build it.');
  const target=popupTarget(tmuxCall(socket,['list-clients','-F','#{client_name}|#{pane_id}|#{client_width}|#{client_height}|#{client_readonly}']),pane);
  if(!target)return unavailable('Focus this Claude pane in one writable terminal of at least 46 columns × 15 rows.');
  dir=mkdtempSync(join(tmpdir(),'boh-popup-'));
  const request={summary:task.prompt.replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,160),reason:task.recommendation.analysis.reasons[0],choices:task.recommendation.choices.map(c=>({id:c.model.id,name:c.model.name,cost:c.model.costRank}))};
  writeFileSync(join(dir,'request.json'),JSON.stringify(request),{mode:0o600});
  const shown=spawnSync('tmux',['-S',socket,'display-popup','-t',target.client,'-E','-B','-w',String(target.width),'-h',String(target.height),'-d',input.cwd,selectedBinary,join(dir,'request.json'),join(dir,'result')],{timeout:50000,stdio:'ignore'});
  if(shown.error || shown.status!==0 || !existsSync(join(dir,'result')))return unavailable('The chooser could not open or was closed without a choice.');
  const latest=previewState(store,input.session_id);
  if(latest?.taskId!==task.id || latest.phase!=='selected')return {continue:false,stopReason:'bohselecta · This choice has expired. No task was started.'};
  const answer=readFileSync(join(dir,'result'),'utf8');
  if(answer==='cancel')return routePreview({...input,prompt:'boh: cancel'},config,store,home);
  const current=resolveCurrent('claude',input.model ?? readModel(store,'claude',input.session_id)?.model,nativeModels(home,'claude',config).models,config);
  if(answer==='keep' || answer===current?.id)return routePreview({...input,prompt:'boh: keep'},config,store,home);
  if(!task.recommendation.choices.some(c=>c.model.id===answer))return unavailable('The chooser returned an invalid selection.');
  if(process.env.BOHSELECTA_POPUP_AUTO_BRIDGE!=='1')return {continue:false,stopReason:`bohselecta · Selected ${answer}. Your task is saved.\nEnter ${continuation(answer)} --task ${task.id} to continue. Automatic handoff is not validated for this Claude version.`};
  const marker=`Selected ${answer} [${task.id.slice(0,8)}]`;
  writeFileSync(join(dir,'bridge.json'),JSON.stringify({socket,pane,owner,hookPid:process.pid,home,session:input.session_id,cwd:input.cwd,taskId:task.id,model:answer,marker}),{mode:0o600});
  const child=spawn(process.execPath,[join(root,'prototypes/popup/continue.mjs'),dir],{detached:true,stdio:'ignore'});child.on('error',()=>{if(dir)rmSync(dir,{recursive:true,force:true});});child.unref();handedOff=true;
  return {continue:false,stopReason:`bohselecta · ${marker}\nContinuing saved task with ${continuation(answer)}. If it pauses, use that command.`};
 }catch{return unavailable('tmux could not display the chooser.');}
 finally{if(dir && !handedOff)rmSync(dir,{recursive:true,force:true});}
}
