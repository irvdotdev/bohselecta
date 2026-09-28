import { query, type Query, type SDKUserMessage, type ModelUsage } from '@anthropic-ai/claude-agent-sdk';
import { catalogModel, type Config } from '../config.ts';
import type { Adapter, Choice, IO, Model, RunResult } from '../types.ts';

export class InputQueue implements AsyncIterable<SDKUserMessage> {
  values: SDKUserMessage[] = [];
  wake?: () => void;
  ended = false;
  push(text: string) { this.values.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' }); this.wake?.(); }
  end() { this.ended = true; this.wake?.(); }
  async *[Symbol.asyncIterator]() {
    while (!this.ended) {
      if (this.values.length) yield this.values.shift()!;
      else await new Promise<void>(resolve => { this.wake = resolve; });
    }
  }
}
export class ClaudeAdapter implements Adapter {
  config: Config; cwd: string; io: IO; sessionId?: string;
  queue = new InputQueue(); q?: Query; reader?: Promise<void>;
  active?: { resolve: (r: RunResult) => void; reject: (e: Error) => void; text: string; models: Set<string>; signal: AbortSignal; configured?: string };
  fatal?: Error; previousCost?: number; previousUsage: Record<string, ModelUsage> = {};
  constructor(config: Config, cwd: string, io: IO, sessionId?: string) {
    this.config = config; this.cwd = cwd; this.io = io; this.sessionId = sessionId;
    this.previousCost = sessionId ? undefined : 0;
  }
  async connect(): Promise<Model[]> {
    this.q = query({ prompt: this.queue, options: {
      cwd: this.cwd, resume: this.sessionId, permissionMode: 'default',
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'], includePartialMessages: true,
      ...(process.env.BOHSELECTA_CLAUDE_BIN ? { pathToClaudeCodeExecutable: process.env.BOHSELECTA_CLAUDE_BIN } : {}),
      canUseTool: async (name, input, options) => {
        if (name === 'AskUserQuestion') {
          const answers: Record<string, string> = {};
          for (const q of (input.questions as any[] ?? [])) {
            this.io.notice(q.question);
            q.options?.forEach((o: any, i: number) => this.io.notice(`${i + 1}. ${o.label}: ${o.description}`));
            const value = await this.io.ask('Your answer: ', options.signal);
            answers[q.question] = q.options?.[Number(value) - 1]?.label ?? value;
          }
          return { behavior: 'allow', updatedInput: { ...input, answers } };
        }
        this.io.notice(`Claude requests ${name}\n${JSON.stringify(input, null, 2)}`);
        const answer = await this.io.ask('Allow this action once? [y/N] ', options.signal);
        return /^y(es)?$/i.test(answer.trim()) ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'User declined this action.' };
      },
      stderr: data => { if (/error|failed/i.test(data)) this.io.notice(data.trim().slice(-1000)); }
    } });
    this.reader = this.read();
    const rows = await this.q.supportedModels();
    const models: Model[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.value || ['default','best','opusplan'].includes(row.value) || row.value.includes('[1m]')) continue;
      const key = row.resolvedModel || row.value;
      if (seen.has(key)) continue; seen.add(key);
      const m = catalogModel('claude', row.value, row.displayName, row.supportedEffortLevels ?? [], this.config, row.resolvedModel);
      if (m) { m.description = row.description; models.push(m); }
    }
    return models;
  }
  private async read() {
    try {
      for await (const msg of this.q!) {
        if ('session_id' in msg && msg.session_id) this.sessionId = msg.session_id;
        const active = this.active; if (!active) continue;
        if (msg.type === 'system' && msg.subtype === 'init') {
          active.configured = msg.model;
          this.io.notice(`Claude configured ${msg.model}${msg.effort ? ` · ${msg.effort}` : ''}.`);
        }
        if (msg.type === 'stream_event' && msg.event.type === 'content_block_delta' && msg.event.delta.type === 'text_delta') {
          active.text += msg.event.delta.text; this.io.text(msg.event.delta.text);
        }
        if (msg.type === 'assistant' && !msg.parent_tool_use_id) {
          if (msg.message.model && msg.message.model !== '<synthetic>') active.models.add(msg.message.model);
          for (const block of msg.message.content) if (block.type === 'tool_use') this.io.notice(`→ ${block.name}`);
        }
        if (msg.type === 'result') {
          const cost = this.previousCost === undefined ? undefined : Math.max(0, msg.total_cost_usd - this.previousCost);
          this.previousCost = msg.total_cost_usd;
          const r: RunResult = { status: active.signal.aborted ? 'interrupted' : msg.is_error ? 'failed' : 'completed', sessionId: this.sessionId!, text: active.text || ('result' in msg ? msg.result : ''), actualModels: [...active.models], configuredModel: active.configured,
            modelEvidence: active.models.size ? 'execution' : active.configured ? 'configuration' : 'unavailable',
            usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cachedInputTokens: msg.usage.cache_read_input_tokens ?? 0, cacheWriteInputTokens: msg.usage.cache_creation_input_tokens ?? 0, estimatedCostUsd: cost, basis: 'Tokens: main agent turn. USD: client estimate across query pipeline, not subscription billing.' },
            error: 'errors' in msg ? msg.errors.join('\n') : undefined };
          if (!active.text && r.text) this.io.text(r.text);
          this.active = undefined; active.resolve(r);
        }
      }
      if (this.active) throw new Error('Claude ended without a task result.');
    } catch (e) { this.fatal = e as Error; this.active?.reject(this.fatal); this.active = undefined; }
  }
  async run(prompt: string, choice: Choice, signal: AbortSignal): Promise<RunResult> {
    if (this.fatal) throw this.fatal;
    if (this.active) throw new Error('A task is already running.');
    signal.throwIfAborted();
    await this.q!.setModel(choice.model.id);
    await this.q!.applyFlagSettings({ effortLevel: choice.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined ?? null });
    signal.throwIfAborted();
    this.io.notice(`Claude accepted ${choice.model.id}${choice.effort ? ` · ${choice.effort}` : ''}.`);
    let timer: NodeJS.Timeout | undefined;
    const interrupt = () => {
      void this.q!.interrupt().catch(() => {});
      timer = setTimeout(() => { this.active?.reject(new Error('Interrupted; Claude did not stop promptly.')); this.active = undefined; this.fatal = new Error('Session closed after interruption. Resume it in a new bohselecta session.'); this.q?.close(); }, 5000);
    };
    signal.addEventListener('abort', interrupt, { once: true });
    try {
      return await new Promise<RunResult>((resolve, reject) => {
        this.active = { resolve, reject, text: '', models: new Set(), signal };
        this.queue.push(prompt);
      });
    } finally { signal.removeEventListener('abort', interrupt); clearTimeout(timer); }
  }
  async close() { this.queue.end(); this.q?.close(); await this.reader; }
}
