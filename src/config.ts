import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Model, Provider } from './types.ts';

export type Config = {
  version: 1;
  feedbackEvery: number;
  retentionDays: number;
  models: Partial<Record<Provider, Record<string, { capability: number; costRank: number; priority?: number; disabled?: boolean }>>>;
  native?: { mode: 'suggest' | 'advisory' | 'off' };
  classifier?: { model: string; dailyBudgetUsd: number; inputUsdPerMillion: number; outputUsdPerMillion: number; maxCallsPerDay: number };
};
export const defaults: Config = { version: 1, feedbackEvery: 5, retentionDays: 90, models: {} };
export function homePath() { return resolve(process.env.BOHSELECTA_HOME || join(homedir(), '.local', 'share', 'bohselecta')); }
export function loadConfig(home: string): Config {
  const path = join(home, 'config.json');
  if (!existsSync(path)) return structuredClone(defaults);
  const c = JSON.parse(readFileSync(path, 'utf8'));
  if (c.version !== 1) throw new Error('Unsupported config version. Expected version: 1.');
  const config = { ...defaults, ...c } as Config;
  for (const key of ['feedbackEvery', 'retentionDays'] as const) {
    if (!Number.isInteger(config[key]) || config[key] < 0) throw new Error(`Invalid ${key} in config.json`);
  }
  for (const provider of Object.values(config.models)) for (const row of Object.values(provider ?? {})) {
    if (!Number.isInteger(row.capability) || row.capability < 1 || row.capability > 4 || !Number.isFinite(row.costRank) || row.costRank <= 0)
      throw new Error('Model overrides require capability 1–4 and a positive costRank.');
  }
  if (config.native && !['suggest','advisory','off'].includes(config.native.mode)) throw new Error('native.mode must be suggest, advisory, or off.');
  if (config.classifier) {
    const c = config.classifier;
    if (!c.model || ![c.dailyBudgetUsd, c.inputUsdPerMillion, c.outputUsdPerMillion, c.maxCallsPerDay].every(n => Number.isFinite(n) && n > 0))
      throw new Error('Classifier requires a model and positive budget, rates, and call limit.');
  }
  return config;
}
export function initConfig(home: string) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const path = join(home, 'config.json');
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(defaults, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return path;
}
export const CATALOG_VERSION = '2026-09-24.1';
// Conservative starter policy, NOT benchmark results or subscription price ratios.
export function catalogModel(provider: Provider, id: string, name: string, efforts: Model['efforts'], config: Config, resolvedId?: string): Model | null {
  const key = resolvedId || id;
  const override = config.models[provider]?.[id] ?? config.models[provider]?.[key];
  if (override?.disabled) return null;
  let capability = 0, costRank = 0, priority = 0;
  if (provider === 'codex') {
    if (/^gpt-6-luna$/.test(key)) { capability = 1; costRank = 1; priority = 3; }
    else if (/^gpt-6-sol$/.test(key)) { capability = 2; costRank = 2; priority = 3; }
    else if (/^gpt-6-astra$/.test(key)) { capability = 3; costRank = 3; priority = 3; }
    else if (/^gpt-5\.6-luna$/.test(key)) { capability = 1; costRank = 1; priority = 2; }
    else if (/^gpt-5\.6-(sol|terra)$/.test(key)) { capability = 2; costRank = 2; priority = 2; }
    else if (/^gpt-5\.5$/.test(key)) { capability = 3; costRank = 3; priority = 1; }
    else if (/^gpt-5\.[34].*mini/.test(key)) { capability = 1; costRank = 1; }
    else if (/^gpt-5\.[34](-codex)?$/.test(key)) { capability = 2; costRank = 2; }
  } else {
    if (/haiku/i.test(key)) { capability = 1; costRank = 1; }
    else if (/sonnet/i.test(key)) { capability = 2; costRank = 2; }
    else if (/opus/i.test(key)) { capability = 3; costRank = 3; }
    else if (/fable/i.test(key)) { capability = 4; costRank = 4; }
    priority = Number(key.match(/(?:sonnet|opus|haiku|fable)-(\d+)/)?.[1] || 0);
  }
  if (override) { capability = override.capability; costRank = override.costRank; priority = override.priority ?? priority; }
  // Unrated models remain visible for explicit selection but are never auto-ranked.
  return { id, name, resolvedId, provider, capability, costRank, priority, efforts };
}
