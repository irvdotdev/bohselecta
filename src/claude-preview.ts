import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Config } from './config.ts';
import { nativeModels, resolveCurrent, validateHook, type HookInput } from './native.ts';
import { modelId, observeModel, readModel } from './native-model.ts';
import { classify, recommend } from './router.ts';
import { Store, type Task } from './store.ts';

export const previewPlugin = 'boh';
export type PreviewState = { taskId?: string; at: number; cwd: string; phase: 'choosing' | 'selected' | 'running' | 'finished' | 'cancelled'; model?: string; paused?: boolean };
export type PreviewOutput = { continue?: boolean; stopReason?: string; systemMessage?: string; hookSpecificOutput?: Record<string, unknown> };
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const key = (id: string) => `claude-preview:${digest(id)}`;
const lifetime = 24 * 3600000;
const families = new Set(['haiku','sonnet','opus']);
export function previewState(store: Store, id: string): PreviewState | undefined {
  try { return JSON.parse(store.getMeta(key(id)) ?? 'null') ?? undefined; } catch { return; }
}
function saveState(store: Store, id: string, state: PreviewState) {
  store.setMeta(key(id), JSON.stringify(state));
  store.db.prepare("DELETE FROM meta WHERE key LIKE 'claude-preview:%' AND json_extract(value, '$.at') < ?").run(state.at-30*86400000);
}
export function continuation(model: string) { return `/${previewPlugin}:${model}`; }
const stop = (message: string): PreviewOutput => ({ continue: false, stopReason: `bohselecta · ${message}` });
function resumeMessage(task: Task): PreviewOutput {
  const [best,...alternatives]=task.recommendation.choices;
  const lines=[`${best.model.name} recommended. ${task.recommendation.analysis.reasons[0] ?? 'A suitable fit for this task.'}`,
    `${continuation(best.model.id)} — recommended · cost tier ${best.model.costRank}`,
    ...alternatives.map(c=>`${continuation(c.model.id)} — more capacity · cost tier ${c.model.costRank}`),
    'Saved task · relative cost tiers · boh: keep / boh: cancel'];
  return stop(lines.join('\n'));
}
export function isPreviewCommand(prompt: string) { return /^\/boh:(haiku|sonnet|opus)(?:\s|$)/.test(prompt.trim()); }
const savedContext = (json: string): PreviewOutput => ({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'Execute originalUserRequest from this saved-task JSON as the user request for this turn, preserving normal permissions: '+json}});

/** Experimental manual continuation: never treat an automatic Skill invocation as a model switch. */
export function routePreview(value: unknown, config: Config, store: Store, home: string, now = Date.now()): PreviewOutput {
  const input = validateHook(value);
  if (input.agent_id) return {};
  const prompt = input.prompt!.trim();
  if (isPreviewCommand(prompt)) {
    const model=prompt.split(/\s/)[0].split(':')[1];
    const taskToken=process.env.BOHSELECTA_POPUP==='1' ? new RegExp('^/boh:(?:haiku|sonnet|opus) --task ([0-9a-f-]{36})$').exec(prompt)?.[1] : undefined;
    if (prompt!==continuation(model) && !taskToken) return stop('Use the continuation command alone. Submit a new prompt to change the task.');
    const catalog=nativeModels(home,'claude',config);
    if (!catalog.verified || !catalog.models.some(m=>m.id===model)) return stop('The selected model is no longer in the fresh catalog. Refresh models and submit the task again.');
    if (model==='haiku' && ['auto','plan'].includes(String(input.permission_mode))) return stop('Haiku is unavailable in this permission mode. Submit the task again to choose another model.');
    try {return savedContext(claimPreview(store,input.session_id,input.cwd,model,now,undefined,taskToken));}
    catch {return stop('No matching unclaimed task. Submit a task and choose its model first.');}
  }
  if (prompt.startsWith('/')) return {};
  const previous = previewState(store, input.session_id);
  const control = /^(?:bohselecta|boh):\s*(.*)$/i.exec(prompt)?.[1].toLowerCase().trim();
  if (control) {
    if (control === 'off' || control === 'on' || control === 'cancel') {
      // Clear pending work so re-enabling never resumes a discarded task.
      if (previous?.taskId) { const task=store.task(previous.taskId); if (task?.status === 'awaiting-choice' || task?.status === 'awaiting-continuation') { task.status='cancelled';store.save(task); } }
      saveState(store,input.session_id,{at:now,cwd:resolve(input.cwd),phase:'cancelled',paused:control==='cancel' ? previous?.paused : control==='off'});
      return stop(control==='cancel' ? 'Task discarded.' : control==='off' ? 'Paused. Type boh: on to resume.' : 'Ready. Write your next task.');
    }
    if (control === 'keep') {
      const observation=readModel(store,'claude',input.session_id);
      const current=modelId(input.model) ?? (observation && now-observation.at<lifetime && now>=observation.at ? observation.model : undefined);
      const catalog=nativeModels(home,'claude',config);
      const model=resolveCurrent('claude',current,catalog.models,config);
      if (!model) return stop('Current model unknown. Choose one of the offered model commands instead.');
      try {return savedContext(claimPreview(store,input.session_id,input.cwd,model.id,now,model));}
      catch {return stop('No matching unclaimed task. Write your next task.');}
    }
    if (control === 'status') {
      const model=modelId(input.model) ?? readModel(store,'claude',input.session_id)?.model ?? 'current model unknown';
      const popup=process.env.BOHSELECTA_POPUP==='1';
      const mode=popup ? `Popup enabled · ${process.env.BOHSELECTA_POPUP_AUTO_BRIDGE==='1' ? 'automatic continuation' : 'manual continuation on this Claude version'}` : 'Command-only preview. Start bohselecta popup claude for the chooser.';
      const task=previous?.taskId ? store.task(previous.taskId) : undefined;
      const last=task?.choice?.reason==='Keeping the configured session model.' ? ` Last task kept ${task.choice.model.name}: the current model was suitable, context was protected, or advisory mode was enabled.` : '';
      return stop(`${previous?.paused ? 'Paused' : 'Enabled'} · ${model}. ${mode} Popups appear only when a model choice is needed.${last}`);
    }
    if (/^feedback (good|stronger|cheaper|unsure)$/.test(control)) {
      if (!previous?.taskId || !store.task(previous.taskId)?.result) return stop('No finished preview task to rate.');
      store.feedback(previous.taskId,control.split(' ')[1] as 'good'|'stronger'|'cheaper'|'unsure');return stop('Feedback saved.');
    }
    return stop('Controls: boh: status | keep | cancel | off | on | feedback good | feedback stronger | feedback cheaper | feedback unsure');
  }
  if (!prompt || previous?.paused || config.native?.mode === 'off') return {};
  if (previous?.taskId && previous.cwd === resolve(input.cwd) && now-previous.at < lifetime && now>=previous.at) {
    const task=store.task(previous.taskId);
    if (task?.prompt === prompt && previous.phase === 'selected' && previous.model) return resumeMessage(task);
    if (previous.phase === 'choosing') return stop('A model choice is already open. Complete or cancel it first.');
  }
  const catalog=nativeModels(home,'claude',config);
  if (!catalog.verified) return stop('Refresh the model catalog in your shell with bohselecta native refresh claude, then retry.');
  const models=catalog.models.filter(m=>families.has(m.id) && !(m.id==='haiku' && ['auto','plan'].includes(String(input.permission_mode))));
  if (!models.length) return stop('No supported model is available in this permission mode.');
  const observation=readModel(store,'claude',input.session_id);
  const observed=observation && now-observation.at<lifetime && now>=observation.at ? observation.model : undefined;
  const current=resolveCurrent('claude',modelId(input.model) ?? observed,models,config);
  const sessionId=`preview-${digest(input.session_id+'\0'+resolve(input.cwd)).slice(0,32)}`;
  const session=store.session(sessionId) ?? {id:sessionId,nativeId:input.session_id,provider:'claude' as const,cwd:resolve(input.cwd),context:''};
  session.native ??= {}; // These sessions must be resumed in the native client, never the standalone launcher.
  const analysis=classify(prompt,session.context);
  const rec=recommend({prompt,context:session.context,models,history:store.recent(250,'claude',session.cwd),currentModel:current?.id});
  if (previous?.taskId) {
    const old=store.task(previous.taskId);
    if (old && ['awaiting-choice','awaiting-continuation','running'].includes(old.status)) {old.status=old.status==='running'?'unobserved':'superseded';store.save(old);}
  }
  const task:Task={id:randomUUID(),createdAt:new Date(now).toISOString(),sessionId,provider:'claude',cwd:session.cwd,prompt,context:session.context,recommendation:rec,status:'awaiting-choice'};
  store.saveSession(session);store.save(task);
  const state:PreviewState={taskId:task.id,at:now,cwd:session.cwd,phase:'choosing'};
  saveState(store,input.session_id,state);
  const best=rec.choices[0];
  const protectContext=analysis.contextDependent || session.context.length>=5000 || (input.context_tokens??0)>=16000;
  if (current && (current.id===best.model.id || (protectContext && current.capability>=rec.analysis.difficulty) || config.native?.mode==='advisory')) {
    task.choice={model:current,reason:'Keeping the configured session model.'};task.status='running';store.save(task);
    saveState(store,input.session_id,{...state,phase:'running',model:current.id});return {};
  }
  task.status='awaiting-continuation';store.save(task);
  saveState(store,input.session_id,{...state,phase:'selected',model:best.model.id});
  return resumeMessage(task);
}

/** Atomically claim a saved task for hook context on a directly invoked skill turn. */
export function claimPreview(store: Store, sessionId: string, cwd: string, model: string, now=Date.now(), keepCurrent?: import('./types.ts').Model, expectedTaskId?: string): string {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const state=previewState(store,sessionId);
    if ((!families.has(model) && !keepCurrent) || !state || state.phase!=='selected' || state.cwd!==resolve(cwd) || now-state.at>=lifetime || now<state.at) throw new Error('No matching pending task. Submit a task and choose a model first.');
    if(expectedTaskId && state.taskId!==expectedTaskId)throw new Error('This popup belongs to a different task.');
    const task=store.task(state.taskId!);
    if (!task || task.status!=='awaiting-continuation') throw new Error('This task has already been claimed or removed.');
    const choice=keepCurrent ? {model:keepCurrent,reason:'User explicitly kept the configured model; execution is unverified.'} : task.recommendation.choices.find(c=>c.model.id===model);
    if (!choice) throw new Error('Choose one of the offered models.');
    task.choice={...choice,reason:keepCurrent ? choice.reason : 'User chose a direct model command; execution is unverified.'};
    task.status='running';store.save(task);saveState(store,sessionId,{...state,phase:'running',model});
    store.db.exec('COMMIT');
    return JSON.stringify({taskId:task.id,originalUserRequest:task.prompt});
  } catch(error) {store.db.exec('ROLLBACK');throw error;}
}
export function previewLifecycle(input: HookInput & {tool_name?:string;tool_input?:{skill?:string}}, store: Store): PreviewOutput {
  if(input.agent_id) return {};
  const incoming=modelId(input.hook_event_name==='PostModelSwitch'?input.to_model:input.model);
  if(incoming) observeModel(store,'claude',input.session_id,incoming,'hook');
  if(input.hook_event_name==='PreToolUse' && input.tool_name==='Skill' && input.tool_input?.skill?.startsWith(previewPlugin+':')) {
    return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Automatic invocation does not reliably switch models in this Claude version. Ask the user to invoke the saved-task skill directly.'}};
  }
  if(!['Stop','StopFailure','SessionEnd'].includes(input.hook_event_name)) return {};
  const state=previewState(store,input.session_id);
  if(!state?.taskId || state.phase!=='running') return {};
  const task=store.task(state.taskId);if(!task || task.status!=='running') return {};
  const status=input.hook_event_name==='Stop'?'completed':input.hook_event_name==='StopFailure'?'failed':'interrupted';
  task.status=status;task.result={status,sessionId:input.session_id,actualModels:[],modelEvidence:'unavailable',text:(input.last_assistant_message??'').slice(-6000),usage:{}};
  store.save(task);saveState(store,input.session_id,{...state,phase:'finished'});
  const session=store.session(task.sessionId);
  if(session && status==='completed') {session.context=`${session.context}\nUser: ${task.prompt}\nAssistant: ${task.result.text.slice(-2000)}`.slice(-6000);store.saveSession(session);}
  return {};
}
