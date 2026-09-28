// Explicit opt-in: makes four short real model requests. Never run by npm test.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../src/adapters/codex.ts';
import { ClaudeAdapter } from '../src/adapters/claude.ts';
import { defaults } from '../src/config.ts';
import type { Choice } from '../src/types.ts';
const cwd = mkdtempSync(join(tmpdir(), 'bohselecta-smoke-'));
const io = { text: (s: string) => process.stdout.write(s), notice: (s: string) => console.error(s), ask: async () => 'n' };
for (const [name, C, ids] of [['codex', CodexAdapter, ['gpt-6-luna','gpt-6-sol']], ['claude', ClaudeAdapter, ['haiku','sonnet']]] as const) {
  const adapter = new C(defaults,cwd,io);
  try {
    const models = await adapter.connect();
    for (let i=0;i<2;i++) {
      const model = models.find(m => m.id === ids[i]);
      if (!model) throw new Error(`Missing smoke model ${ids[i]}`);
      const choice: Choice = { model, effort: model.efforts.includes('low') ? 'low' : undefined, reason:'Integration smoke test' };
      const result = await adapter.run(i === 0 ? 'This is a connectivity test. Do not use any tools. Remember the word tangerine. Reply with only READY.' : 'Do not use any tools. What word did I ask you to remember? Reply with only that word.', choice, AbortSignal.timeout(60000));
      console.log('\nRESULT',JSON.stringify({ provider:name, turn:i+1, ...result }));
      if (result.status !== 'completed' || (i === 1 && !result.text.toLowerCase().includes('tangerine'))) throw new Error('Smoke test failed: completion or context continuity.');
    }
  } finally { await adapter.close(); }
}
