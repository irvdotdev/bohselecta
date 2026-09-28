import {homePath,loadConfig} from '../../src/config.ts';
import {Store} from '../../src/store.ts';
import {validateHook} from '../../src/native.ts';
import {previewLifecycle,routePreview} from '../../src/claude-preview.ts';
import {popupHook} from '../../src/popup.ts';
let store;
try {
 const chunks=[];let size=0;
 for await(const c of process.stdin){size+=c.length;if(size>2*1024*1024)throw Error('Input too large');chunks.push(c);}
 const input=validateHook(JSON.parse(Buffer.concat(chunks).toString()));
 const home=homePath(),config=loadConfig(home);store=new Store(home,config.retentionDays,250);
 let output=input.hook_event_name==='UserPromptSubmit' ? routePreview(input,config,store,home) : previewLifecycle(input,store);
 if(input.hook_event_name==='UserPromptSubmit')output=popupHook(input,output,config,store,home);
 console.log(JSON.stringify(output));
} catch {console.log(JSON.stringify({continue:false,stopReason:'bohselecta preview unavailable. No model selection has been verified.'}));}
finally {store?.close();}
