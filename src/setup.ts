import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Terminal } from './terminal.ts';
import type { Provider } from './types.ts';

type Preferences = { version: 1; provider: Provider; directory: string };
export function readPreferences(home: string): Preferences | undefined {
  const path = join(home, 'preferences.json');
  if (!existsSync(path)) return;
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.version !== 1 || !['codex', 'claude'].includes(value.provider) || typeof value.directory !== 'string')
    throw new Error('Invalid launcher preferences. Run bohselecta setup to choose them again.');
  return value;
}
export function projectDirectory(value: string): string {
  const path = value.trim().replace(/^(["'])(.*)\1$/, '$2');
  const expanded = path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
  const directory = resolve(expanded);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) throw new Error('That folder does not exist. Paste an existing folder path.');
  return directory;
}
export function savePreferences(home: string, preferences: Preferences) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const temporary = join(home, `preferences-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(preferences, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(temporary, join(home, 'preferences.json'));
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function installedProviders(): Provider[] {
  return (['codex', 'claude'] as Provider[]).filter(provider => {
    try {
      execFileSync(process.env[`BOHSELECTA_${provider.toUpperCase()}_BIN`] || provider, ['--version'], { stdio: 'ignore', timeout: 4000 });
      return true;
    } catch { return false; }
  });
}
export async function launchPreferences(home: string, reset = false, cwd?: string): Promise<Preferences | undefined> {
  const saved = reset ? undefined : readPreferences(home);
  if (saved) {
    try { return { ...saved, directory: projectDirectory(cwd ?? saved.directory) }; }
    catch { throw new Error('Your saved project folder is unavailable. Run bohselecta setup to choose another, or use --cwd PATH.'); }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Run bohselecta in an interactive terminal for first-time setup, or specify bohselecta codex / bohselecta claude.');
  const terminal = new Terminal();
  const controller = new AbortController();
  terminal.onInterrupt = () => controller.abort();
  try {
    terminal.notice('Welcome to bohselecta\nChoose your assistant and project once. Next time, just type bohselecta.');
    const providers = installedProviders();
    if (!providers.length) throw new Error('Install and sign in to Codex or Claude Code first, then run bohselecta again.');
    providers.forEach((provider, index) => terminal.notice(`${index + 1}. ${provider === 'codex' ? 'Codex' : 'Claude'}`));
    let provider: Provider | undefined;
    while (!provider) {
      const answer = (await terminal.ask('Which assistant? [1] ', controller.signal)).trim() || '1';
      provider = providers[Number(answer) - 1] ?? providers.find(p => p === answer.toLowerCase());
      if (!provider) terminal.notice(`Choose ${providers.map((_, i) => i + 1).join(' or ')}.`);
    }
    let directory = '';
    while (!directory) {
      terminal.notice('Which project folder should the assistant work in? You can paste its path.');
      const answer = await terminal.ask(`Folder [${cwd ?? process.cwd()}]: `, controller.signal);
      try { directory = projectDirectory(answer.trim() || cwd || process.cwd()); }
      catch (e) { terminal.notice((e as Error).message); }
    }
    const preferences: Preferences = { version: 1, provider, directory };
    savePreferences(home, preferences);
    terminal.notice('Saved. Use bohselecta setup whenever you want to change these choices.');
    return preferences;
  } catch (e) {
    if (controller.signal.aborted) { terminal.notice('Setup cancelled.'); return; }
    throw e;
  } finally { terminal.close(); }
}
