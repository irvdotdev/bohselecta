import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, lstatSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Config } from './config.ts';
import type { Adapter, IO, Provider } from './types.ts';
import { nativeModels, type NativeCatalog } from './native.ts';

const marker = '# bohselecta-native-v1';
const statusMarker = '# bohselecta-statusline-v1';
const statusScript = fileURLToPath(new URL('../bin/bohselecta-statusline.js', import.meta.url));
const hookScript = fileURLToPath(new URL('../bin/bohselecta-hook.js', import.meta.url));
const shellQuote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
type Handler = { type?: string; command?: string; [key: string]: unknown };
type Group = { hooks: Handler[]; [key: string]: unknown };
type Document = { hooks?: Record<string, Group[]>; [key: string]: unknown };
const owned = (hook: Handler) => hook.type === 'command' && typeof hook.command === 'string' && hook.command.endsWith(` ${marker}`);
export const eventsFor = (provider: Provider) => ['SessionStart','UserPromptSubmit','Stop','SessionEnd', ...(provider === 'claude' ? ['PostModelSwitch','StopFailure'] : ['Interrupt'])];

export function configPath(provider: Provider, directory?: string) {
  const root = directory || (provider === 'codex' ? process.env.CODEX_HOME : process.env.CLAUDE_CONFIG_DIR) || join(homedir(), `.${provider}`);
  return join(resolve(root), provider === 'codex' ? 'hooks.json' : 'settings.json');
}

function readDocument(path: string): { raw?: string; document: Document } {
  if (!existsSync(path)) return { document: {} };
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing to replace symlinked settings: ${path}. Install using --config-dir with the real directory.`);
  const raw = readFileSync(path, 'utf8');
  const document = JSON.parse(raw) as Document;
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error(`Expected a JSON object in ${path}.`);
  if (document.hooks !== undefined) {
    if (!document.hooks || typeof document.hooks !== 'object' || Array.isArray(document.hooks)) throw new Error(`Invalid hooks object in ${path}.`);
    for (const groups of Object.values(document.hooks)) {
      if (!Array.isArray(groups) || groups.some(g => !g || !Array.isArray(g.hooks) || g.hooks.some(h => !h || typeof h !== 'object')))
        throw new Error(`Invalid hook group in ${path}; existing settings were left untouched.`);
    }
  }
  return { raw, document };
}

function updateStatusline(document: Document, home: string, remove: boolean) {
  const current = document.statusLine as Handler | undefined;
  const ours = current?.type === 'command' && typeof current.command === 'string' && current.command.endsWith(` ${statusMarker}`);
  let previous: Handler | null = current ?? null;
  if (ours) {
    const encoded = current!.command!.match(/--previous '([A-Za-z0-9+/=]+)' # bohselecta-statusline-v1$/)?.[1];
    if (!encoded) throw new Error('Cannot recover the original status line; settings were left untouched.');
    previous = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  }
  if (remove) {
    if (ours) { if (previous) document.statusLine = previous; else delete document.statusLine; }
    return;
  }
  // Leave unsupported/custom status-line configuration types intact.
  if (previous && (previous.type !== 'command' || typeof previous.command !== 'string')) return;
  const encoded = Buffer.from(JSON.stringify(previous)).toString('base64');
  document.statusLine = { ...(current ?? {}), type: 'command',
    command: `/usr/bin/env BOHSELECTA_HOME=${shellQuote(resolve(home))} ${shellQuote(process.execPath)} --disable-warning=ExperimentalWarning ${shellQuote(statusScript)} --previous '${encoded}' ${statusMarker}`,
    refreshInterval: current?.refreshInterval ?? 5 };
}

export function installHooks(provider: Provider, home: string, directory?: string, remove = false, dryRun = false) {
  const path = configPath(provider, directory);
  const { raw, document } = readDocument(path);
  const before = JSON.stringify(document);
  const hooks = document.hooks ?? {};
  for (const [event, groups] of Object.entries(hooks)) {
    const kept: Group[] = [];
    for (const group of groups) {
      if (!group.hooks.some(owned)) { kept.push(group); continue; }
      const remaining = group.hooks.filter(h => !owned(h));
      if (remaining.length) kept.push({ ...group, hooks: remaining });
    }
    if (kept.length) hooks[event] = kept; else delete hooks[event];
  }
  if (!remove) {
    const command = `/usr/bin/env BOHSELECTA_HOME=${shellQuote(resolve(home))} ${shellQuote(process.execPath)} --disable-warning=ExperimentalWarning ${shellQuote(hookScript)} ${provider} ${marker}`;
    for (const event of eventsFor(provider)) {
      hooks[event] ??= [];
      hooks[event].push({ hooks: [{ type: 'command', command, timeout: ['SessionEnd','Interrupt'].includes(event) ? 3 : 5 }] });
    }
  }
  if (Object.keys(hooks).length) document.hooks = hooks;
  else delete document.hooks;
  if (provider === 'claude') updateStatusline(document, home, remove);
  const changed = JSON.stringify(document) !== before;
  const output = JSON.stringify(document, null, 2) + '\n';
  let backup: string | undefined;
  if (changed && !dryRun) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.bohselecta-${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, output, { mode: raw === undefined ? 0o600 : lstatSync(path).mode & 0o777, flag: 'wx' });
      const fresh = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
      if (fresh !== raw) throw new Error('Client settings changed during installation; retry to merge the latest settings.');
      if (raw !== undefined) {
        backup = `${path}.bohselecta-backup-${Date.now()}-${randomUUID().slice(0,8)}`;
        writeFileSync(backup, raw, { mode: 0o600, flag: 'wx' });
      }
      renameSync(temp, path);
    } finally { if (existsSync(temp)) unlinkSync(temp); }
  }
  return { provider, path, changed, backup, dryRun, hooks: remove ? 0 : eventsFor(provider).length };
}

export function hookStatus(provider: Provider, home: string, config: Config, directory?: string) {
  const path = configPath(provider, directory);
  const { document } = readDocument(path);
  const installedEvents = Object.entries(document.hooks ?? {}).filter(([,groups]) => groups.some(g => g.hooks.some(owned))).map(([event]) => event);
  const catalog = nativeModels(home, provider, config);
  let clientVersion = 'unavailable';
  try { clientVersion = execFileSync(process.env[`BOHSELECTA_${provider.toUpperCase()}_BIN`] || provider, ['--version'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore','pipe','pipe'] }).trim(); } catch {}
  return { provider, path, clientVersion, installedEvents,
    installed: eventsFor(provider).every(e => installedEvents.includes(e)),
    modelObserver: provider === 'claude' && typeof (document.statusLine as Handler)?.command === 'string' && (document.statusLine as Handler).command!.endsWith(` ${statusMarker}`),
    catalog: catalog.verified ? 'discovered within 7 days' : 'bundled / not verified',
    ratedModels: catalog.models.filter(m => m.capability > 0).map(m => m.id), mode: config.native?.mode ?? 'suggest',
    note: provider === 'codex' ? 'Installation does not imply trust. Review and trust bohselecta hooks using /hooks in Codex; restart an existing session.' : 'Restart Claude Code after installation. SessionStart, PostModelSwitch, and the local status-line observer track the configured model; hooks do not prove execution identity.' };
}

export async function refreshCatalog(providers: Provider[], home: string, config: Config, cwd: string) {
  const path = join(home, 'native-catalog.json');
  let catalog: NativeCatalog = { version: 1, providers: {} };
  try { const prior = JSON.parse(readFileSync(path,'utf8')); if (prior.version === 1 && prior.providers) catalog = prior; } catch {}
  const results: { provider: Provider; models?: string[]; error?: string }[] = [];
  const priorBypass = process.env.BOHSELECTA_BYPASS;
  process.env.BOHSELECTA_BYPASS = '1';
  try {
    for (const provider of providers) {
      let adapter: Adapter | undefined;
      let timeout: NodeJS.Timeout | undefined;
      const io: IO = { text() {}, notice() {}, async ask() { throw new Error('Model discovery cannot grant permissions.'); } };
      try {
        if (provider === 'codex') { const { CodexAdapter } = await import('./adapters/codex.ts'); adapter = new CodexAdapter(config,cwd,io); }
        else { const { ClaudeAdapter } = await import('./adapters/claude.ts'); adapter = new ClaudeAdapter(config,cwd,io); }
        const models = await Promise.race([adapter.connect(), new Promise<never>((_,reject) => { timeout = setTimeout(() => reject(new Error('Model discovery timed out.')),20000); })]);
        if (!models.length) throw new Error('Client returned no models.');
        catalog.providers[provider] = { checkedAt: new Date().toISOString(), models };
        results.push({ provider, models: models.map(m => m.id) });
      } catch (error) { results.push({ provider, error: (error as Error).message.slice(0,300) }); }
      finally { clearTimeout(timeout); await adapter?.close().catch(() => {}); }
    }
  } finally { if (priorBypass === undefined) delete process.env.BOHSELECTA_BYPASS; else process.env.BOHSELECTA_BYPASS = priorBypass; }
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(catalog,null,2)+'\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary,path);
  return results;
}

export async function nativeCli(args: string[], options: { home: string; config: Config; directory?: string; cwd?: string; json?: boolean; offline?: boolean; dryRun?: boolean }) {
  const [command = 'status', target = 'both'] = args;
  if (!['status','install','uninstall','refresh'].includes(command)) throw new Error('Use native status, install, uninstall, or refresh.');
  if (!['both','codex','claude'].includes(target)) throw new Error('Choose codex, claude, or both.');
  if (options.directory && target === 'both') throw new Error('--config-dir requires one client: codex or claude.');
  if (options.directory && command === 'refresh') throw new Error('--config-dir is for hook installation/status only; set CODEX_HOME or CLAUDE_CONFIG_DIR to discover models using another client configuration.');
  if (args.length > 2) throw new Error('Unexpected extra native command arguments.');
  const providers: Provider[] = target === 'both' ? ['codex','claude'] : [target as Provider];
  const results: unknown[] = [];
  if (command === 'install' || command === 'uninstall') {
    // Validate every target before changing any settings file.
    for (const provider of providers) readDocument(configPath(provider,options.directory));
    for (const provider of providers) results.push(installHooks(provider,options.home,options.directory,command === 'uninstall',options.dryRun));
  }
  if ((command === 'refresh' || command === 'install') && !options.offline && !options.dryRun) {
    if (!options.json) console.log('Checking model catalogs (no task execution)…');
    results.push(...await refreshCatalog(providers,options.home,options.config,resolve(options.cwd || process.cwd())));
  }
  if (command === 'status' || (command === 'install' && !options.dryRun)) results.push(...providers.map(p=>hookStatus(p,options.home,options.config,options.directory)));
  if (options.json) console.log(JSON.stringify(results,null,2));
  else for (const item of results) {
    const r = item as any;
    if ('changed' in r) console.log(`${r.provider}: ${options.dryRun ? 'preview — ' : ''}${command === 'uninstall' ? 'hooks removed' : 'hooks configured'}${r.changed ? '' : ' (already up to date)'}\n  ${r.path}${r.backup ? `\n  Backup: ${r.backup}` : ''}`);
    else if ('installed' in r) console.log(`${r.provider}: ${r.installed ? 'installed' : 'not fully installed'} · ${r.clientVersion}\n  Catalog: ${r.catalog} · mode: ${r.mode}\n  ${r.note}`);
    else console.log(`${r.provider}: ${r.error ? `catalog unavailable — ${r.error}` : `${r.models.length} models discovered`}`);
  }
}
