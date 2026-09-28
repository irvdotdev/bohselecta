import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { catalogModel, CATALOG_VERSION, type Config } from './config.ts';
import { classify, recommend } from './router.ts';
import { Store, type Session, type Task } from './store.ts';
import type { Model, Provider, Feedback } from './types.ts';
import { modelId, observeModel, readModel } from './native-model.ts';

export type NativeState = { paused?: boolean; pending?: { taskId: string; hash: string; at: number; requestId?: string; reason?: string }; activeTaskId?: string;
  lastTaskId?: string; completedCount?: number; changedDuringTurn?: boolean };
export type HookInput = { session_id: string; cwd: string; hook_event_name: string; prompt?: string; model?: string;
  to_model?: string; source?: string; turn_id?: string; prompt_id?: string; last_assistant_message?: string; stop_hook_active?: boolean;
  permission_mode?: string; agent_id?: string; agent_type?: string; error?: string; context_tokens?: number };
export type HookOutput = { decision?: 'block'; reason?: string; systemMessage?: string };
export type NativeCatalog = { version: 1; providers: Partial<Record<Provider, { checkedAt: string; models: Model[] }>> };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 160);
const pendingLifetime = 24 * 60 * 60 * 1000;

export function validateHook(value: unknown): HookInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a hook object.');
  const v = value as HookInput;
  if (typeof v.session_id !== 'string' || !v.session_id || v.session_id.length > 200 ||
      typeof v.cwd !== 'string' || !isAbsolute(v.cwd) || v.cwd.length > 4096 || typeof v.hook_event_name !== 'string')
    throw new Error('Missing or invalid session, directory, or event.');
  if (v.hook_event_name === 'UserPromptSubmit' && (typeof v.prompt !== 'string' || v.prompt.length > 100000))
    throw new Error('Prompt missing or too large for local routing.');
  return v;
}

export function nativeModels(home: string, provider: Provider, config: Config): { models: Model[]; verified: boolean } {
  try {
    const catalog = JSON.parse(readFileSync(join(home, 'native-catalog.json'), 'utf8')) as NativeCatalog;
    const row = catalog.version === 1 ? catalog.providers[provider] : undefined;
    const age = Date.now() - Date.parse(row?.checkedAt ?? '');
    if (row && age >= 0 && age < 7 * 86400000 && Array.isArray(row.models)) {
      const models = row.models.filter(m => modelId(m.id) && m.provider === provider).map(m => {
        const rated = catalogModel(provider, m.id, clean(m.name || m.id), Array.isArray(m.efforts) ? m.efforts : [], config, modelId(m.resolvedId));
        if (rated) rated.defaultEffort = m.defaultEffort;
        return rated;
      }).filter((m): m is Model => Boolean(m));
      if (models.length) return { models, verified: true };
    }
  } catch { /* An absent or stale cache must not start a client on the prompt path. */ }
  const ids = provider === 'codex' ? ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'] : ['haiku', 'sonnet', 'opus'];
  return { verified: false, models: ids.map(id => catalogModel(provider, id, id, id === 'haiku' ? [] : ['low','medium','high'], config)).filter((m): m is Model => Boolean(m)) };
}

export function resolveCurrent(provider: Provider, id: string | undefined, models: Model[], config: Config): Model | undefined {
  if (!id) return;
  const exact = models.find(m => m.id === id || m.resolvedId === id);
  if (exact) return exact;
  // Only map dated Claude names to aliases when the discovered resolved ID agrees.
  if (provider === 'claude') {
    const family = id.match(/^claude-(haiku|sonnet|opus|fable)(?:-|$)/)?.[1];
    const alias = models.find(m => m.id === family && (!m.resolvedId || m.resolvedId === id));
    if (alias) return { ...alias, resolvedId: id };
  }
  return catalogModel(provider, id, id, [], config) ?? undefined;
}

export function switchInstruction(provider: Provider, model: Model, effort?: string): string {
  if (provider === 'claude') return `/model ${model.id}`;
  return `/model → select ${model.id}${effort ? ` (${effort} effort)` : ''}`;
}

function trackRunning(task: Task, session: Session, store: Store, current?: Model) {
  task.status = 'running';
  if (task.native) task.native.startedAt = new Date().toISOString();
  task.choice = current ? { model: current, reason: 'Model configured in the native client; execution identity is not exposed by these hooks.' } : undefined;
  session.native!.activeTaskId = task.id;
  session.native!.pending = undefined;
  session.native!.changedDuringTurn = false;
  store.save(task);
}

function control(prompt: string, session: Session, store: Store): HookOutput | undefined {
  const match = /^bohselecta:\s*(.*)$/i.exec(prompt.trim());
  if (!match) return;
  const command = match[1].toLowerCase().trim();
  const state = session.native!;
  let message: string;
  if (command === 'off') { state.paused = true; state.pending = undefined; message = 'Paused recommendations for this session. Type “bohselecta: on” to resume.'; }
  else if (command === 'on') { state.paused = false; message = 'Recommendations enabled for this session.'; }
  else if (command === 'status') {
    const modelStatus = session.currentModel
      ? `current model: ${clean(session.currentModel)} · local routing, relative cost tiers.`
      : 'waiting for your client to report its current model.\nThe hook is installed and responding. Model-switch suggestions are inactive until the model is known.\nRun /model, select the model you want to use, then type “bohselecta: status” again.\nIf it is still unknown, run bohselecta install claude --offline in your shell to install the status-line model observer, then restart Claude.';
    message = `${state.paused ? 'Paused' : 'Enabled'} · ${modelStatus}\nControls: bohselecta: off | on | feedback good | feedback stronger | feedback cheaper | feedback unsure`;
  }
  else if (/^feedback (good|stronger|cheaper|unsure)$/.test(command)) {
    if (!state.lastTaskId || !store.task(state.lastTaskId)?.result) message = 'No finished task in this session to rate yet.';
    else { const feedback = command.split(' ')[1] as Feedback; store.feedback(state.lastTaskId, feedback); message = `Saved “${feedback}” for the last finished task. Thank you.`; }
  } else message = 'Controls: bohselecta: status | off | on | feedback good | feedback stronger | feedback cheaper | feedback unsure';
  store.saveSession(session);
  return { decision: 'block', reason: `bohselecta · ${message}\nThis control message was handled locally; no model call is needed.` };
}

/** Synchronous, local-only hook policy. No client, classifier, shell, or network calls. */
export function handleNativeHook(provider: Provider, input: HookInput, config: Config, store: Store, home: string, now = Date.now()): HookOutput {
  if (input.agent_id || process.env.BOHSELECTA_BYPASS === '1') return {};
  if (!['SessionStart','UserPromptSubmit','PostModelSwitch','Stop','StopFailure','Interrupt','SessionEnd'].includes(input.hook_event_name)) return {};
  const cwd = resolve(input.cwd);
  const id = `native-${provider}-${hash(`${cwd}\0${input.session_id}`).slice(0,32)}`;
  const session: Session = store.session(id) ?? { id, provider, cwd, nativeId: input.session_id, context: '', native: {} };
  session.native ??= {};
  const state = session.native;
  const incomingModel = modelId(input.hook_event_name === 'PostModelSwitch' ? input.to_model : input.model);
  // Model identity belongs to the native session, independently of its working directory.
  if (incomingModel) observeModel(store, provider, input.session_id, incomingModel, 'hook', now);
  else if (input.hook_event_name === 'SessionStart' && input.source !== 'compact') {
    const prior = readModel(store, provider, input.session_id);
    // Startup hooks and the status line can arrive in either order.
    if (!prior || prior.source !== 'statusline' || now - prior.at > 5000)
      observeModel(store, provider, input.session_id, undefined, 'reset', now);
  }
  const observation = readModel(store, provider, input.session_id);
  const currentModel = observation ? (now - observation.at < 86400000 ? observation.model : undefined) : session.currentModel;
  if (state.activeTaskId && session.currentModel !== currentModel) state.changedDuringTurn = true;
  session.currentModel = currentModel;
  const save = (output: HookOutput = {}) => { store.saveSession(session); return output; };
  if (input.hook_event_name === 'SessionStart') {
    if (input.source === 'clear') { session.context = ''; session.native = {}; }
    return save();
  }
  if (input.hook_event_name === 'PostModelSwitch') return save();
  if (['Stop','StopFailure','Interrupt','SessionEnd'].includes(input.hook_event_name)) {
    const task = state.activeTaskId ? store.task(state.activeTaskId) : undefined;
    if (!task || task.status !== 'running') return save();
    const completed = input.hook_event_name === 'Stop';
    const status = completed ? 'completed' : input.hook_event_name === 'StopFailure' ? 'failed' : 'interrupted';
    const text = typeof input.last_assistant_message === 'string' ? input.last_assistant_message.slice(-6000) : '';
    task.status = status;
    task.result = { status, sessionId: input.session_id, actualModels: [],
      configuredModel: state.changedDuringTurn ? undefined : task.choice?.model.id,
      modelEvidence: !state.changedDuringTurn && task.choice ? 'configuration' : 'unavailable',
      text, usage: {}, ...(status === 'failed' ? { error: clean(String(input.error ?? 'Client error')) } : {}) };
    // Stop means the client ended a turn, not proof that its answer is correct.
    task.durationMs = Math.max(0, now - Date.parse(task.native?.startedAt ?? task.createdAt));
    store.save(task); state.activeTaskId = undefined; state.lastTaskId = task.id;
    if (completed) {
      state.completedCount = (state.completedCount ?? 0) + 1;
      session.context = `${session.context}\nUser: ${task.prompt}\nAssistant: ${text.slice(-2000)}`.slice(-6000);
      if (!state.paused && config.feedbackEvery > 0 && state.completedCount % config.feedbackEvery === 0 && !input.stop_hook_active)
        return save({ systemMessage: 'bohselecta · Was that model a good fit? Optional: type “bohselecta: feedback good” (or stronger / cheaper / unsure).' });
    }
    return save();
  }

  const prompt = input.prompt!.trim();
  const controlled = control(prompt, session, store);
  if (controlled) return controlled;
  if (state.paused || config.native?.mode === 'off' || !prompt || prompt.startsWith('/')) return save();
  const { models, verified } = nativeModels(home, provider, config);
  const current = resolveCurrent(provider, session.currentModel, models, config);
  const promptHash = hash(prompt.replace(/\r\n/g, '\n'));
  if (state.pending && now - state.pending.at >= 0 && now - state.pending.at < pendingLifetime && state.pending.hash === promptHash) {
    const prior = store.task(state.pending.taskId);
    if (prior?.status === 'awaiting-switch') {
      const requestId = input.prompt_id ?? input.turn_id;
      if (requestId && state.pending.requestId === requestId) return save({ decision: 'block', reason: state.pending.reason ?? 'bohselecta · Review the model suggestion, then resubmit the task.' });
      const initial = resolveCurrent(provider, prior.native?.initialModel, models, config);
      const switched = current && current.id !== initial?.id && prior.recommendation.choices.some(c => c.model.id === current.id);
      prior.native!.decision = switched ? 'switched' : 'kept';
      trackRunning(prior, session, store, current);
      return save({ systemMessage: `bohselecta · Continuing with ${clean(session.currentModel ?? 'your current model')}. ${switched ? 'Switch recognised.' : 'Your choice is respected; this suggestion will not repeat.'}` });
    }
  }
  if (state.pending) {
    const abandoned = store.task(state.pending.taskId);
    if (abandoned?.status === 'awaiting-switch') { abandoned.status = 'superseded'; store.save(abandoned); }
    state.pending = undefined;
  }
  if (state.activeTaskId) {
    const unfinished = store.task(state.activeTaskId);
    if (unfinished?.status === 'running') { unfinished.status = 'unobserved'; store.save(unfinished); }
    state.activeTaskId = undefined;
  }
  const analysis = classify(prompt, session.context);
  const task: Task = { id: randomUUID(), createdAt: new Date(now).toISOString(), sessionId: id, provider, cwd, prompt, context: session.context,
    status: 'recommended', native: { decision: 'continued', catalogVerified: verified, initialModel: session.currentModel },
    recommendation: { analysis, choices: [], source: 'rules', catalogVersion: CATALOG_VERSION, elapsedMs: 0 } };
  try {
    task.recommendation = recommend({ prompt, context: session.context, models, history: store.recent(250, provider, cwd), currentModel: current?.id });
  } catch {
    trackRunning(task, session, store, current);
    return save({ systemMessage: 'bohselecta · No rated model fits confidently. Keeping your current model; review /model if needed.' });
  }
  const rec = task.recommendation;
  const best = rec.choices[0];
  const downgrade = Boolean(current && current.costRank > best.model.costRank && current.capability >= rec.analysis.difficulty);
  const upgrade = Boolean(current?.capability && current.capability < rec.analysis.difficulty);
  // Present uncertain new tasks as a choice, while avoiding churn in follow-ups/long contexts.
  const canCompare = !analysis.contextDependent && session.context.length < 5000 && (input.context_tokens ?? 0) < 16000;
  const clearDowngrade = downgrade && rec.analysis.confidence >= 0.85 && canCompare;
  const compareOptions = downgrade && rec.choices.length === 2 && canCompare;
  const shouldSuggest = (upgrade || clearDowngrade || compareOptions) && current?.id !== best.model.id;
  if (!shouldSuggest) { trackRunning(task, session, store, current); return save(); }
  const options = rec.choices.map((c, i) => `${i + 1}. ${clean(c.model.name)} · cost tier ${c.model.costRank}\n   ${switchInstruction(provider, c.model, c.effort)}`).join('\n');
  const message = `bohselecta · ${upgrade ? 'This task may need a stronger model.' : clearDowngrade ? 'A lighter model should be enough.' : 'The scope is uncertain. Compare these two options before continuing.'}\n${rec.analysis.reasons[0]}\n${options}\n${verified ? 'Catalog checked recently; access can still depend on your account.' : 'Bundled catalog; availability not checked. Run “bohselecta native refresh” in your shell to update it.'}\nCost tiers are relative, not dollar estimates.\nSwitch, then resubmit your original task. To keep your current model, simply resubmit it unchanged.\nType “bohselecta: off” to pause suggestions for this session.`;
  if (config.native?.mode === 'advisory' || !verified) {
    task.native!.decision = 'advised'; trackRunning(task, session, store, current);
    return save({ systemMessage: message.replace('Switch, then resubmit your original task. To keep your current model, simply resubmit it unchanged.', 'Your task is continuing. For future tasks, you can switch models.') });
  }
  task.status = 'awaiting-switch'; task.native!.decision = 'suggested'; store.save(task);
  state.pending = { taskId: task.id, hash: promptHash, at: now, requestId: input.prompt_id ?? input.turn_id, reason: message };
  return save({ decision: 'block', reason: message });
}
