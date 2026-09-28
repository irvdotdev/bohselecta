import { randomUUID } from 'node:crypto';
import { classify, recommend } from './router.ts';
import { refineAnalysis } from './classifier.ts';
import { CATALOG_VERSION, type Config } from './config.ts';
import { Store, type Session, type Task } from './store.ts';
import type { Adapter, Effort, IO, Model, Recommendation } from './types.ts';

export function displayRecommendation(r: Recommendation, io: IO) {
  io.notice(`${r.analysis.category} · difficulty ${r.analysis.difficulty}/3 · ${r.source}`);
  r.choices.forEach((c, i) => io.notice(`${i + 1}. ${c.model.name} (${c.model.id})${c.effort ? ` · ${c.effort} reasoning` : ''}\n   ${c.reason}`));
}
export async function executeTask(args: { prompt: string; session: Session; models: Model[]; adapter: Adapter; store: Store; config: Config; io: IO; signal: AbortSignal; override?: string; effort?: string; choose?: number; dryRun?: boolean }): Promise<Task> {
  const { prompt, session, store, config, io, signal } = args;
  const routingStarted = performance.now();
  const analysis = classify(prompt, session.context);
  const task: Task = { id: randomUUID(), createdAt: new Date().toISOString(), sessionId: session.id, provider: session.provider, cwd: session.cwd, prompt, context: session.context, status: 'routing', recommendation: { analysis, source: 'rules', choices: [], catalogVersion: CATALOG_VERSION, elapsedMs: 0 } };
  store.save(task);
  try {
    const history = store.recent(250, session.provider, session.cwd).filter(t => t.id !== task.id);
    let rec = recommend({ prompt, context: session.context, models: args.models, history, currentModel: session.currentModel, override: args.override });
    if (rec.source !== 'history' && rec.source !== 'override') {
      const refined = await refineAnalysis(prompt, session.context, rec.analysis, config, store, signal);
      if (refined.notice) io.notice(refined.notice);
      if (refined.analysis.source === 'classifier') rec = recommend({ prompt, context: session.context, models: args.models, history, currentModel: session.currentModel, analysis: refined.analysis });
    }
    rec.elapsedMs = performance.now() - routingStarted;
    task.recommendation = rec; task.status = 'recommended'; store.save(task);
    displayRecommendation(rec, io);
    if (args.dryRun) return task;
    let index = 0;
    if (args.choose !== undefined) index = args.choose - 1;
    else if (rec.choices.length > 1) {
      const answer = await io.ask('Choose 1 or 2 (Enter cancels): ', signal);
      if (!answer.trim()) { task.status = 'cancelled'; store.save(task); return task; }
      index = Number(answer.trim()) - 1;
    }
    if (!Number.isInteger(index) || !rec.choices[index]) throw new Error('Invalid selection. Task was not sent.');
    const selected = structuredClone(rec.choices[index]);
    if (args.effort) {
      if (!selected.model.efforts.includes(args.effort as Effort)) throw new Error(`${selected.model.id} does not support reasoning effort ${args.effort}.`);
      selected.effort = args.effort as Effort;
    }
    signal.throwIfAborted();
    task.choice = selected; task.status = 'running'; store.save(task);
    io.notice(`Selected ${selected.model.name}${selected.effort ? ` · ${selected.effort}` : ''}. Starting task…`);
    const start = performance.now();
    const result = await args.adapter.run(prompt, selected, signal);
    task.durationMs = Math.round(performance.now() - start); task.result = result; task.status = result.status;
    session.nativeId = result.sessionId;
    session.clientState = result.clientState;
    session.currentModel = selected.model.id;
    // Bounded routing context; the client retains the complete conversation.
    session.context = `${session.context}\nUser: ${prompt}\nAssistant: ${result.text.slice(0,1000)}\n${result.text.slice(-2000)}`.slice(-6000);
    store.saveSession(session); store.save(task);
    io.notice(`\n${result.status} · task ${task.id}\n${result.modelEvidence === 'execution' ? `Observed model: ${result.actualModels.join(', ')}` : `Configured model: ${result.configuredModel ?? selected.model.id} (execution identity unavailable)`}`);
    if (result.usage.inputTokens !== undefined) io.notice(`Usage: ${result.usage.inputTokens} input / ${result.usage.outputTokens ?? 0} output tokens${result.usage.estimatedCostUsd !== undefined ? ` · estimated API-equivalent $${result.usage.estimatedCostUsd.toFixed(4)}` : ''}`);
    if (result.error) io.notice(result.error);
    return task;
  } catch (e) {
    task.status = signal.aborted ? 'interrupted' : 'failed';
    task.error = (e as Error).message; store.save(task);
    if (args.adapter?.sessionId) { session.nativeId = args.adapter.sessionId; store.saveSession(session); }
    throw e;
  }
}
