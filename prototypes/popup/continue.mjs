// A bounded, version-specific UI bridge. Never send task text or arbitrary shell input.
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {tmuxCall,readyScreen} from '../../src/popup.ts';
import {previewState,continuation} from '../../src/claude-preview.ts';
import {Store} from '../../src/store.ts';
const dir=process.argv[2];let store;
try {
 const request=JSON.parse(readFileSync(join(dir,'bridge.json'),'utf8'));
 if(!/^[0-9a-f-]{36}$/.test(request.taskId) || !['sonnet','opus','haiku'].includes(request.model))throw Error('Invalid model');
 store=new Store(request.home,0,100);
 const start=Date.now();let stable=0;
 while(Date.now()-start<12000){
  await delay(100);
  const state=previewState(store,request.session),task=store.task(request.taskId);
  if(state?.taskId!==request.taskId || state.phase!=='selected' || state.cwd!==request.cwd || task?.status!=='awaiting-continuation')break;
  process.kill(request.owner,0);
  if(Number(tmuxCall(request.socket,['display-message','-p','-t',request.pane,'#{pane_pid}']))!==request.owner)break;
  try{process.kill(request.hookPid,0);continue;}catch{}
  const screen=tmuxCall(request.socket,['capture-pane','-p','-t',request.pane]);
  if(!readyScreen(screen,request.marker)){stable=0;continue;}
  if(++stable<2)continue;
  // Match the exact task marker and empty prompt again immediately before sending.
  if(!readyScreen(tmuxCall(request.socket,['capture-pane','-p','-t',request.pane]),request.marker))break;
  tmuxCall(request.socket,['send-keys','-t',request.pane,'-l',`${continuation(request.model)} --task ${request.taskId}`]);
  tmuxCall(request.socket,['send-keys','-t',request.pane,'Enter']);
  break;
 }
}catch{/* Keep the saved task available for manual continuation. */}
finally{store?.close();rmSync(dir,{recursive:true,force:true});}
