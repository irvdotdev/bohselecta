import { Rpc } from './rpc.ts';
import { catalogModel, type Config } from '../config.ts';
import type { Adapter, Choice, IO, Model, RunResult, Usage } from '../types.ts';

export class CodexAdapter implements Adapter {
  rpc: Rpc; config: Config; cwd: string; io: IO; sessionId?: string;
  constructor(config: Config, cwd: string, io: IO, sessionId?: string, command = process.env.BOHSELECTA_CODEX_BIN || 'codex', state?: RunResult['clientState']) {
    this.config = config; this.cwd = cwd; this.io = io; this.sessionId = sessionId;
    if (state?.codexTokens) this.totals = state.codexTokens;
    this.rpc = new Rpc(command, ['app-server', '--stdio'], cwd);
    this.rpc.handler = (method, params) => this.handleRequest(method, params);
  }
  activeSignal?: AbortSignal;
  loaded = false;
  async handleRequest(method: string, p: any): Promise<unknown> {
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      this.io.notice(`${method.includes('commandExecution') ? 'Command' : 'File change'} approval\n${JSON.stringify(p, null, 2)}`);
      const answer = await this.io.ask('Allow this action once? [y/N] ', this.activeSignal);
      return { decision: /^y(es)?$/i.test(answer.trim()) ? 'accept' : 'decline' };
    }
    if (method === 'item/permissions/requestApproval') {
      // Do not silently grant a broader permission profile.
      this.io.notice('The agent requested broader permissions. This terminal version denies profile expansion.');
      return { permissions: {}, scope: 'turn' };
    }
    if (method === 'item/tool/requestUserInput') {
      const answers: Record<string, { answers: string[] }> = {};
      for (const q of p.questions) {
        this.io.notice(q.question);
        q.options?.forEach((o: any, i: number) => this.io.notice(`${i + 1}. ${o.label}: ${o.description}`));
        const answer = await this.io.ask('Your answer: ', this.activeSignal);
        const option = q.options?.[Number(answer) - 1];
        answers[q.id] = { answers: [option?.label ?? answer] };
      }
      return { answers };
    }
    if (method === 'item/tool/call') return { success: false, contentItems: [{ type: 'inputText', text: 'This client does not implement that dynamic tool.' }] };
    throw new Error(`Unsupported request ${method}; no permission granted.`);
  }
  async connect(): Promise<Model[]> {
    await this.rpc.request('initialize', { clientInfo: { name: 'bohselecta', title: 'bohselecta', version: '0.1.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
    this.rpc.send({ method: 'initialized' });
    const models: Model[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.rpc.request('model/list', { includeHidden: false, cursor, limit: 100 });
      for (const row of response.data) {
        const m = catalogModel('codex', row.model, row.displayName, row.supportedReasoningEfforts.map((e: any) => e.reasoningEffort), this.config);
        if (m) { m.defaultEffort = row.defaultReasoningEffort; m.description = row.description; models.push(m); }
      }
      cursor = response.nextCursor;
    } while (cursor);
    return models;
  }
  async run(prompt: string, choice: Choice, signal: AbortSignal): Promise<RunResult> {
    this.activeSignal = signal;
    signal.throwIfAborted();
    let text = '', usage: Usage = {}, turnId: string | undefined;
    let configuredModel: string | undefined, reroutedModel: string | undefined;
    const params = { model: choice.model.id, cwd: this.cwd, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write', config: { model_reasoning_effort: choice.effort } };
    if (!this.loaded) {
      const started = await this.rpc.request(this.sessionId ? 'thread/resume' : 'thread/start', this.sessionId ? { ...params, threadId: this.sessionId, excludeTurns: true } : params);
      this.sessionId = started.thread.id;
      this.loaded = true;
    }
    signal.throwIfAborted();
    return await new Promise<RunResult>((resolve, reject) => {
      let done = false;
      let acknowledged = false;
      let completedTurn: any;
      let cancelTimer: NodeJS.Timeout | undefined;
      const cleanup = () => {
        this.rpc.off('notification', notification); this.rpc.off('fatal', fatal);
        signal.removeEventListener('abort', interrupt); clearTimeout(cancelTimer); this.activeSignal = undefined;
      };
      const fatal = (e: Error) => { if (!done) { done = true; cleanup(); reject(e); } };
      const finish = (turn: any) => {
        if (done) return; done = true; cleanup();
        resolve({ sessionId: this.sessionId!, status: signal.aborted ? 'interrupted' : turn.status === 'completed' ? 'completed' : turn.status === 'interrupted' ? 'interrupted' : 'failed', text, usage,
          clientState: { codexTokens: this.totals }, configuredModel: reroutedModel ?? configuredModel, actualModels: [], modelEvidence: 'configuration', error: turn.error?.message });
      };
      const interrupt = () => {
        if (turnId) void this.rpc.request('turn/interrupt', { threadId: this.sessionId, turnId }).catch(fatal);
        cancelTimer ??= setTimeout(() => { void this.rpc.close(); fatal(new Error('Interrupted; client did not stop promptly.')); }, 5000);
      };
      const notification = (method: string, p: any) => {
        if (p.threadId !== this.sessionId) return;
        if (method === 'turn/started') { turnId = p.turn.id; if (signal.aborted) interrupt(); }
        if (method === 'item/agentMessage/delta') { text += p.delta; this.io.text(p.delta); }
        if (method === 'item/commandExecution/outputDelta') this.io.text(p.delta);
        if (method === 'item/started' && !['agentMessage','userMessage','reasoning'].includes(p.item.type)) this.io.notice(`→ ${p.item.type}${p.item.command ? `: ${p.item.command}` : ''}`);
        if (method === 'thread/tokenUsage/updated') {
          const u = p.tokenUsage.total;
          // Total is cumulative; baseline is captured below before submission.
          usage = { inputTokens: Math.max(0, u.inputTokens - baseline.inputTokens), outputTokens: Math.max(0, u.outputTokens - baseline.outputTokens), cachedInputTokens: Math.max(0, u.cachedInputTokens - baseline.cachedInputTokens), cacheWriteInputTokens: Math.max(0, (u.cacheWriteInputTokens ?? 0) - baseline.cacheWriteInputTokens), basis: 'Client token telemetry; no subscription-dollar conversion.' };
          this.totals = u;
        }
        if (method === 'model/rerouted') { reroutedModel = p.toModel; this.io.notice(`Codex rerouted ${p.fromModel} → ${p.toModel}: ${p.reason}`); }
        if (method === 'turn/completed') { completedTurn = p.turn; if (acknowledged) finish(p.turn); }
        if (method === 'error' && !p.willRetry) this.io.notice(p.error?.message ?? 'Codex reported an error.');
      };
      const baseline = this.totals;
      this.rpc.on('notification', notification); this.rpc.on('fatal', fatal); signal.addEventListener('abort', interrupt, { once: true });
      void this.rpc.request('turn/start', { threadId: this.sessionId, model: choice.model.id, effort: choice.effort, input: [{ type: 'text', text: prompt, text_elements: [] }] })
        .then(async r => {
          turnId = r.turn.id;
          if (signal.aborted) interrupt();
          const state = await this.rpc.request('thread/read', { threadId: this.sessionId });
          configuredModel = state.thread.model;
          if (configuredModel !== choice.model.id && configuredModel !== reroutedModel) {
            await this.rpc.request('turn/interrupt', { threadId: this.sessionId, turnId });
            throw new Error(`Codex model mismatch: requested ${choice.model.id}, configured ${configuredModel}. Turn interrupted.`);
          }
          this.io.notice(`Codex configured ${configuredModel}${choice.effort ? ` · ${choice.effort}` : ''}.`);
          acknowledged = true;
          if (completedTurn) finish(completedTurn);
        }).catch(fatal);
    });
  }
  totals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0 };
  async close() { await this.rpc.close(); }
}
