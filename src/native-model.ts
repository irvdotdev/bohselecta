import { createHash } from 'node:crypto';
import type { Store } from './store.ts';
import type { Provider } from './types.ts';

export const modelId = (value: unknown): string | undefined => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]-]{0,159}$/.test(value) ? value : undefined;
type Observation = { model?: string; at: number; source: 'hook' | 'statusline' | 'reset' };
const key = (provider: Provider, session: string) => `native-model:${provider}:${createHash('sha256').update(session).digest('hex')}`;
export function readModel(store: Store, provider: Provider, session: string): Observation | undefined {
  try { return JSON.parse(store.getMeta(key(provider, session)) ?? 'null') ?? undefined; } catch { return; }
}
export function observeModel(store: Store, provider: Provider, session: string, model: string | undefined, source: Observation['source'], at = Date.now()) {
  const prior = readModel(store, provider, session);
  if (prior && prior.at > at) return;
  store.setMeta(key(provider, session), JSON.stringify({ model, source, at }));
  store.db.prepare("DELETE FROM meta WHERE key LIKE 'native-model:%' AND json_extract(value, '$.at') < ?").run(at - 30 * 86400000);
}
export function statuslineModel(value: unknown): { session: string; model: string } | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as { session_id?: unknown; model?: { id?: unknown } };
  const model = modelId(v.model?.id);
  if (typeof v.session_id !== 'string' || !v.session_id || v.session_id.length > 200 || !model) return;
  return { session: v.session_id, model };
}
