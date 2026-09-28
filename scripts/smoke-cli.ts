// Explicit opt-in: four short real requests, isolated workspace and local history.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const cli = fileURLToPath(new URL('../bin/bohselecta.js', import.meta.url));
const home = mkdtempSync(join(tmpdir(), 'bohselecta-cli-live-'));
const cwd = mkdtempSync(join(tmpdir(), 'bohselecta-workspace-'));
function run(args: string[]) {
  return execFileSync(process.execPath, [cli, ...args, '--home', home], { encoding: 'utf8', timeout: 90000, stdio: ['ignore','pipe','pipe'] });
}
for (const [provider, model] of [['codex','gpt-6-luna'],['claude','haiku']]) {
  run([provider, '--cwd', cwd, '--model', model, '--prompt', 'Connectivity test: do not use tools. Remember the word apricot. Reply only READY.']);
  const sessions = JSON.parse(run(['sessions']));
  const session = sessions.find((s: any) => s.provider === provider);
  assert.ok(session.nativeId);
  const text = run([provider, '--resume', session.id, '--model', model, '--prompt', 'Do not use tools. Reply only with the word I asked you to remember.']);
  assert.match(text.toLowerCase(), /apricot/);
  const tasks = JSON.parse(run(['history','--json'])).filter((t: any) => t.provider === provider);
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t: any) => t.status === 'completed'));
  console.log(`${provider}: CLI execution, persistence, and fresh-process resume passed.`);
  console.log(JSON.stringify(tasks.map((t: any) => ({model:t.choice.model.id,usage:t.result.usage,nativeId:t.result.sessionId})),null,2));
}
console.log(`Smoke history: ${home}`);
