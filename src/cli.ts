import { fileURLToPath } from 'node:url';
import { defaultCli } from './shell-default.ts';
import { launchPopup } from './popup.ts';
import { nativeCli } from './native-install.ts';
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { type Config, homePath, initConfig, loadConfig, catalogModel } from './config.ts';
import { Store } from './store.ts';
import { Terminal } from './terminal.ts';
import { launchPreferences } from './setup.ts';
import { executeTask } from './engine.ts';
import { CodexAdapter } from './adapters/codex.ts';
import { ClaudeAdapter } from './adapters/claude.ts';
import type { Adapter, Feedback, Model, Provider } from './types.ts';

const help = `bohselecta — the right model before the task starts

  bohselecta install                       Install native hooks for Claude and Codex
  bohselecta popup claude                  Open Claude with the experimental Ratatui chooser
  bohselecta preview claude                Open Claude with quiet, local model advice
  bohselecta native status                  Check hook installation and model catalogs
  bohselecta native refresh                 Refresh discovered models (no task execution)
  bohselecta uninstall                     Remove only bohselecta hooks
  bohselecta                               Open the standalone prototype
  bohselecta setup claude                  Optionally make plain claude use the popup
  bohselecta default claude on|off|status   Manage the shell shortcut
  bohselecta setup                         Choose your assistant and project
  bohselecta codex                         Start a routed Codex session
  bohselecta claude                        Start a routed Claude session
  bohselecta codex --prompt "Your task"    Run one task
  bohselecta recommend codex "Your task"  Recommend without running
  bohselecta models codex                  List models from your client
  bohselecta doctor                        Check installed clients
  bohselecta history [--json]              Show recent decisions and outcomes
  bohselecta sessions                      List resumable bohselecta sessions
  bohselecta feedback ID good|stronger|cheaper|unsure
  bohselecta config init                   Create editable config.json
  bohselecta history delete ID             Delete a local task record
  bohselecta history clear --yes           Delete local tasks and sessions

Options:
  --cwd PATH       Agent working directory (defaults to current directory)
  --resume ID      Resume a bohselecta session from 'sessions'
  --model ID       Explicit model override
  --effort LEVEL   Explicit supported reasoning effort
  --choose 1|2     Choose a recommendation in non-interactive mode
  --offline        Use bundled catalog for recommendations only
  --json           JSON output for history, models, or recommendations
  --home PATH      Override the private local data directory
  --no-feedback    Do not ask for occasional feedback
  --config-dir DIR Override one client settings directory for native install/status
  --dry-run        Preview native install/uninstall without changing files

Session commands: /help /models /model ID /auto /feedback VALUE /history /exit
End a line with \\ to continue a multiline prompt. Ctrl-C cancels the current task.
Routing is local by default. Optional API classification requires explicit config.
`;
function providerOf(value?: string): Provider {
  if (value !== 'claude' && value !== 'codex') throw new Error('Specify codex or claude.');
  return value;
}
export function offlineModels(provider: Provider, config: Config): Model[] {
  const ids = provider === 'codex' ? ['gpt-6-luna','gpt-6-sol','gpt-6-astra'] : ['haiku','sonnet','opus'];
  return ids.map(id => catalogModel(provider, id, id, provider === 'claude' && id === 'haiku' ? [] : ['low','medium','high'], config)).filter((m): m is Model => Boolean(m));
}
function lockSession(home: string, id: string): () => void {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid session ID.');
  const directory = join(home, 'locks'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, id);
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid session lock: ${path}`);
    try { process.kill(pid, 0); throw new Error('This session is already open in another bohselecta process.'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; unlinkSync(path); }
  }
  writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 });
  return () => { try { unlinkSync(path); } catch {} };
}
export async function main(argv = process.argv.slice(2)) {
  const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, options: {
    'config-dir': { type:'string' }, 'dry-run': { type:'boolean' }, help: { type:'boolean', short:'h' }, version: { type:'boolean' }, cwd: { type:'string' }, resume: { type:'string' }, model: { type:'string' }, effort: { type:'string' }, choose: { type:'string' }, prompt: { type:'string' }, offline: { type:'boolean' }, json: { type:'boolean' }, home: { type:'string' }, 'no-feedback': { type:'boolean' }, yes: { type:'boolean' }
  } });
  if (v.version) { console.log(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version); return; }
  if (v.help) { console.log(help); return; }
  if (v.choose && !['1','2'].includes(v.choose)) throw new Error('--choose must be 1 or 2.');
  if ((p[0]==='setup' && p[1]==='claude') || p[0]==='default') {
    const setup=p[0]==='setup';
    if(Object.keys(v).length || p[1]!=='claude' || p.length!==(setup?2:3))throw Error('Use bohselecta setup claude or bohselecta default claude on | off | status.');
    return defaultCli(setup?'on':p[2],setup);
  }
  const home = v.home ? resolve(v.home) : homePath();
  if (!p.length || p[0] === 'setup') {
    const preferences = await launchPreferences(home, p[0] === 'setup', v.cwd);
    if (!preferences) return;
    p.splice(0, p.length, preferences.provider);
    v.cwd = preferences.directory;
  }
  const config = loadConfig(home);
  if (v.offline) delete config.classifier;
  if (['native','install','uninstall'].includes(p[0])) {
    const args = p[0] === 'native' ? p.slice(1) : p;
    return nativeCli(args, { home, config, directory: v['config-dir'], cwd: v.cwd, json: v.json, offline: v.offline, dryRun: v['dry-run'] });
  }
  if (v['config-dir'] || v['dry-run']) throw new Error('--config-dir and --dry-run apply to native integration commands only.');
  if (p[0] === 'popup') {
    if(p.length!==2 || p[1]!=='claude' || Object.keys(v).some(k=>!['cwd','home','model'].includes(k)))throw Error('Use bohselecta popup claude [--cwd PATH] [--model MODEL] [--home PATH].');
    if(!process.stdin.isTTY || !process.stdout.isTTY)throw Error('Open the popup in an interactive terminal.');
    return launchPopup(home,resolve(v.cwd||process.cwd()),v.model||'sonnet');
  }
  if (p[0] === 'preview') {
    if (p.length !== 2 || p[1] !== 'claude') throw new Error('Use bohselecta preview claude.');
    if (Object.keys(v).some(key=>!['cwd','home','model'].includes(key))) throw new Error('Preview supports --cwd, --home, and --model only.');
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Open the Claude preview in an interactive terminal.');
    console.log(`bohselecta · starting Claude on ${v.model || 'sonnet'}. Write naturally; switch suggestions include a one-step command.`);
    const args=['--plugin-dir',fileURLToPath(new URL('../prototypes/claude-native',import.meta.url))];
    args.push('--model',v.model || 'sonnet');
    const child=spawnSync(process.env.BOHSELECTA_CLAUDE_BIN || 'claude',args,{cwd:resolve(v.cwd || process.cwd()),stdio:'inherit',env:{...process.env,BOHSELECTA_HOME:home,BOHSELECTA_CLAUDE_PREVIEW:'1'}});
    if (child.error) throw child.error;
    process.exitCode=child.status ?? (child.signal==='SIGINT'?130:1);return;
  }
  if (p[0] === 'config') { console.log(p[1] === 'init' ? initConfig(home) : JSON.stringify(config, null, 2)); return; }
  if (p[0] === 'doctor') {
    console.log(`Node ${process.version}\nData: ${home}`);
    for (const binary of ['codex','claude']) {
      try { console.log(execFileSync(process.env[`BOHSELECTA_${binary.toUpperCase()}_BIN`] || binary, ['--version'], { encoding:'utf8', timeout:10000, stdio:['ignore','pipe','pipe'] }).trim()); }
      catch { console.log(`${binary}: unavailable. Install it and sign in before starting a session.`); }
    }
    console.log('Model discovery: bohselecta models codex / bohselecta models claude'); return;
  }
  const store = new Store(home, config.retentionDays);
  let terminal: Terminal | undefined, adapter: Adapter | undefined, unlock: (() => void) | undefined;
  let controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Cancelled by user.'));
  try {
    if (p[0] === 'history') {
      if (p[1] === 'clear') { if (!v.yes) throw new Error('Use --yes to delete bohselecta history. Native client transcripts are separate.'); store.clear(); console.log('Local tasks and sessions deleted.'); }
      else if (p[1] === 'delete') { store.deleteTask(p[2]); console.log('Local task deleted. Native client transcripts are unchanged.'); }
      else {
        const tasks = store.recent(100);
        console.log(v.json ? JSON.stringify(tasks,null,2) : tasks.map(t => `${t.id}  ${t.provider}  ${t.status}  ${t.choice?.model.id ?? 'unselected'}\n  ${t.prompt.replace(/\s+/g,' ').slice(0,100)}${t.feedback ? ` [${t.feedback}]` : ''}`).join('\n') || 'No tasks yet.');
      } return;
    }
    if (p[0] === 'sessions') { console.log(JSON.stringify(store.sessions(),null,2)); return; }
    if (p[0] === 'feedback') { store.feedback(p[1], p[2] as Feedback); console.log('Feedback saved.'); return; }
    const dryRun = p[0] === 'recommend';
    const listing = p[0] === 'models';
    const provider = providerOf(dryRun || listing ? p[1] : p[0]);
    if (v.offline && !dryRun && !listing) throw new Error('--offline is only for recommendations and model listings.');
    if (v.json && !dryRun && !listing) throw new Error('--json is supported for recommendations, models, and history.');
    const saved = v.resume ? store.session(v.resume) : undefined;
    if (v.resume && !saved) throw new Error('Session not found. Use bohselecta sessions.');
    if (saved?.native) throw new Error('This is a native-client session. Resume it inside Claude Code or Codex.');
    if (saved && saved.provider !== provider) throw new Error('Resume with the same client as the original session.');
    if (saved && v.cwd && resolve(v.cwd) !== saved.cwd) throw new Error('A resumed session must use its original working directory.');
    const cwd = saved?.cwd ?? resolve(v.cwd || process.cwd());
    if (saved) unlock = lockSession(home, saved.id);
    terminal = new Terminal(); terminal.onInterrupt = interrupt;
    process.on('SIGINT', interrupt);
    const io = v.json ? { text: (_: string) => {}, notice: (_: string) => {}, ask: terminal.ask.bind(terminal) } : terminal;
    if (!v.offline) {
      io.notice(`Connecting to ${provider}…`);
      process.env.BOHSELECTA_BYPASS = '1'; // This wrapper already routes; avoid invoking its installed native hooks twice.
      adapter = provider === 'codex' ? new CodexAdapter(config,cwd,io,saved?.nativeId,undefined,saved?.clientState) : new ClaudeAdapter(config,cwd,io,saved?.nativeId);
    }
    let models: Model[];
    if (adapter) {
      let timer: NodeJS.Timeout | undefined;
      try { models = await Promise.race([adapter.connect(), new Promise<never>((_,reject) => { timer = setTimeout(() => reject(new Error('Client initialization timed out. Check your client login and configuration.')),30000); })]); }
      finally { clearTimeout(timer); }
    } else models = offlineModels(provider,config);
    if (!models.length) throw new Error('The client returned no usable models. Check account access and config.json.');
    if (listing) { console.log(v.json ? JSON.stringify(models,null,2) : models.map(m => `${m.id.padEnd(22)} ${m.name} · ${m.costRank ? `cost tier ${m.costRank}` : 'unrated: explicit selection only'} · effort: ${m.efforts.join(', ') || 'default'}`).join('\n')); return; }
    let prompt = v.prompt ?? (dryRun ? p.slice(2) : p.slice(1)).join(' ');
    const once = Boolean(prompt) || dryRun || !terminal.rl;
    if (!prompt && !terminal.rl) prompt = readFileSync(0,'utf8').trim();
    if (dryRun && !prompt) throw new Error('Provide a task to recommend a model for.');
    const session = saved ?? store.newSession(provider,cwd);
    unlock ??= lockSession(home, session.id);
    let override = v.model, lastId: string | undefined;
    io.notice(`bohselecta · ${provider}\nSession ${session.id}\n${cwd}\n${v.offline ? 'Offline catalog — availability is not verified.\n' : ''}Type your task below. I’ll pick a suitable model before it starts.\n/help for commands · /exit to leave`);
    while (!terminal.closed) {
      controller = new AbortController();
      try {
        if (!prompt) {
          if (once) break;
          prompt = await terminal.ask('\nbohselecta › ',controller.signal);
          while (prompt.endsWith('\\')) prompt = prompt.slice(0,-1) + '\n' + await terminal.ask('… ',controller.signal);
        }
        if (!prompt.trim()) { prompt = ''; continue; }
        if (prompt.startsWith('/')) {
          const [command,...rest] = prompt.trim().split(/\s+/); const value = rest.join(' ');
          if (command === '/exit' || command === '/quit') break;
          if (command === '/help') io.notice(help);
          else if (command === '/models') io.notice(models.map(m => `${m.id} · ${m.name}`).join('\n'));
          else if (command === '/model') { if (!models.some(m => m.id === value || m.resolvedId === value)) throw new Error('Unknown model. Use /models.'); override = value; io.notice(`Model pinned to ${value}. /auto restores routing.`); }
          else if (command === '/auto') { override = undefined; io.notice('Automatic routing restored.'); }
          else if (command === '/feedback') { if (!lastId) throw new Error('Run a task first.'); store.feedback(lastId,value as Feedback); io.notice('Feedback saved.'); }
          else if (command === '/history') io.notice(store.recent(10,provider,cwd).map(t => `${t.id} ${t.status} ${t.choice?.model.id ?? ''}`).join('\n'));
          else throw new Error('Unknown session command. Use /help.');
          prompt = ''; if (once) break; continue;
        }
        const task = await executeTask({ prompt, session, models, adapter: adapter!, store, config, io, signal:controller.signal, override, effort:v.effort, choose:v.choose ? Number(v.choose) : undefined, dryRun });
        lastId = task.id;
        if (v.json) console.log(JSON.stringify(task,null,2));
        if (task.status === 'failed' && once) process.exitCode = 1;
        if (task.result && !once && !v['no-feedback'] && config.feedbackEvery && (task.recommendation.analysis.confidence < 0.8 || override)) {
          const counter = Number(store.getMeta('feedbackCounter') || 0) + 1; store.setMeta('feedbackCounter',String(counter));
          if (counter % config.feedbackEvery === 0) {
            const answer = await terminal.ask('Model fit? good / stronger / cheaper / unsure (Enter skips): ',controller.signal);
            if (answer.trim()) store.feedback(task.id,answer.trim() as Feedback);
          }
        }
      } catch (e) {
        if (once) throw e;
        io.notice((e as Error).message);
      }
      prompt = ''; if (once) break;
    }
  } finally {
    process.off('SIGINT',interrupt); terminal?.close();
    try { await adapter?.close(); } finally { unlock?.(); store.close(); }
  }
}
