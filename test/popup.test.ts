import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readyScreen,popupHook,popupTarget,automaticBridgeSupported} from '../src/popup.ts';
import {Store} from '../src/store.ts';
import {defaults,catalogModel} from '../src/config.ts';
import {routePreview,previewState} from '../src/claude-preview.ts';
test('continuation readiness requires this task marker before an empty prompt',()=>{
 const marker='Selected sonnet [a1234567]';
 assert.equal(readyScreen(`Operation stopped: ${marker}\n────────\n❯ \n────────`,marker),true);
 assert.equal(readyScreen(`Operation stopped: ${marker}\n❯ my new request`,marker),false);
 assert.equal(readyScreen(`Operation stopped: other task\n❯ `,marker),false);
 assert.equal(readyScreen(`❯ \n${marker}`,marker),false);
 assert.equal(readyScreen(`Operation stopped: ${marker}\n❯ \n❯ started typing`,marker),false);
});
test('task-bound continuation cannot claim a newer request; plain preview rejects internal arguments',t=>{
 const home=mkdtempSync(join(tmpdir(),'boh-popup-test-'));const store=new Store(home,0);const config=structuredClone(defaults);
 t.after(()=>{store.close();rmSync(home,{recursive:true,force:true});});
 writeFileSync(join(home,'native-catalog.json'),JSON.stringify({version:1,providers:{claude:{checkedAt:new Date().toISOString(),models:['haiku','sonnet','opus'].map(id=>catalogModel('claude',id,id,[],config))}}}));
 const input={session_id:'test',cwd:'/project',hook_event_name:'UserPromptSubmit',model:'opus',prompt:'todo app'};
 const first=routePreview(input,config,store,home),old=previewState(store,'test')!.taskId;
 assert.deepEqual(popupHook(input,first,config,store,home),first);
 const command=`/boh:sonnet --task ${old}`;
 assert.equal(routePreview({...input,prompt:command},config,store,home).continue,false);
 const previous=process.env.BOHSELECTA_POPUP;process.env.BOHSELECTA_POPUP='1';
 try {
  routePreview({...input,prompt:'todo app with a calendar'},config,store,home);
  assert.equal(routePreview({...input,prompt:command},config,store,home).continue,false);
  const current=previewState(store,'test')!.taskId;
  const result=routePreview({...input,prompt:`/boh:sonnet --task ${current}`},config,store,home);
  assert.match(String(result.hookSpecificOutput?.additionalContext),/calendar/);
  assert.equal(routePreview({...input,prompt:`/boh:sonnet --task ${current}`},config,store,home).continue,false);
 }finally{if(previous===undefined)delete process.env.BOHSELECTA_POPUP;else process.env.BOHSELECTA_POPUP=previous;}
});

test('popup targets only the active writable client and fits small terminals',()=>{
 assert.deepEqual(popupTarget('/dev/ttys1|%2|70|18|0','%2'),{client:'/dev/ttys1',width:68,height:16});
 assert.deepEqual(popupTarget('/dev/ttys1|%2|200|60|0','%2'),{client:'/dev/ttys1',width:76,height:20});
 assert.equal(popupTarget('/dev/ttys1|%3|80|24|0','%2'),undefined);
 assert.equal(popupTarget('/dev/ttys1|%2|80|24|1','%2'),undefined);
 assert.equal(popupTarget('/dev/ttys1|%2|45|14|0','%2'),undefined);
 assert.equal(popupTarget('/dev/ttys1|%2|80|24|0\n/dev/ttys2|%2|80|24|0','%2'),undefined);
 assert.equal(automaticBridgeSupported('2.1.282 (Claude Code)'),true);
 assert.equal(automaticBridgeSupported('2.1.283 (Claude Code)'),true);
 assert.equal(automaticBridgeSupported('2.1.284 (Claude Code)'),false);
 assert.equal(automaticBridgeSupported('2.1.2830 (Claude Code)'),false);
});

test('popup failures explain recovery; unvalidated versions preserve a task-bound manual choice',t=>{
 const home=mkdtempSync(join(tmpdir(),'boh-popup-display-'));const store=new Store(home,0);const config=structuredClone(defaults);
 const keys=['PATH','BOHSELECTA_POPUP','BOHSELECTA_POPUP_AUTO_BRIDGE','BOHSELECTA_POPUP_OWNER_PID','TMUX','TMUX_PANE','BOH_TEST_ACTION'];
 const env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 t.after(()=>{for(const key of keys){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}store.close();rmSync(home,{recursive:true,force:true});});
 writeFileSync(join(home,'tmux'),`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);if(args.includes('display-message'))console.log(process.env.BOHSELECTA_POPUP_OWNER_PID);else if(args.includes('list-clients'))console.log('/dev/test|%1|70|18|0');else if(args.includes('display-popup')){if(process.env.BOH_TEST_ACTION==='error')process.exit(1);fs.writeFileSync(args.at(-1),process.env.BOH_TEST_ACTION||'sonnet');}`,{mode:0o700});
 process.env.PATH=home+':'+process.env.PATH;process.env.BOHSELECTA_POPUP='1';process.env.BOHSELECTA_POPUP_AUTO_BRIDGE='0';process.env.BOHSELECTA_POPUP_OWNER_PID=String(process.pid);process.env.TMUX_PANE='%1';
 writeFileSync(join(home,'native-catalog.json'),JSON.stringify({version:1,providers:{claude:{checkedAt:new Date().toISOString(),models:['haiku','sonnet','opus'].map(id=>catalogModel('claude',id,id,[],config))}}}));
 const input={session_id:'popup-regression',cwd:'/project',hook_event_name:'UserPromptSubmit',model:'opus',prompt:'an app'};
 const routed=routePreview(input,config,store,home);assert.equal(routed.continue,false);
 delete process.env.TMUX;
 assert.match(popupHook(input,routed,config,store,home,join(home,'tmux')).stopReason!,/not a popup terminal/);
 process.env.TMUX='/tmp/test-socket,1,0';process.env.BOH_TEST_ACTION='error';
 assert.match(popupHook(input,routed,config,store,home,join(home,'tmux')).stopReason!,/could not open/);
 process.env.BOH_TEST_ACTION='sonnet';
 const result=popupHook(input,routed,config,store,home,join(home,'tmux'));
 const id=previewState(store,input.session_id)!.taskId!;
 assert.match(result.stopReason!,new RegExp(`/boh:sonnet --task ${id}`));
 assert.equal(store.task(id)!.status,'awaiting-continuation');
 const claimed=routePreview({...input,prompt:`/boh:sonnet --task ${id}`},config,store,home);
 assert.match(String(claimed.hookSpecificOutput?.additionalContext),/an app/);
 const quiet={...input,session_id:'quiet',model:'sonnet'};
 assert.deepEqual(routePreview(quiet,config,store,home),{});
 const status=routePreview({...quiet,prompt:'boh: status'},config,store,home);
 assert.match(status.stopReason!,/Popup enabled/);assert.match(status.stopReason!,/Last task kept/);
});

test('installed releases use the prebuilt popup without a Cargo build',async t=>{
 const {popupBinary}=await import('../src/popup.ts');
 const {mkdirSync}=await import('node:fs');
 const root=mkdtempSync(join(tmpdir(),'boh-binary-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.equal(popupBinary(root),join(root,'prototypes/popup/target/debug/boh-popup'));
 mkdirSync(join(root,'prototypes/popup/prebuilt'),{recursive:true});
 writeFileSync(join(root,'prototypes/popup/prebuilt/boh-popup'),'binary');
 assert.equal(popupBinary(root),join(root,'prototypes/popup/prebuilt/boh-popup'));
});
