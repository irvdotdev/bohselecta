#!/usr/bin/env node
// A separate entry point keeps the native prompt path free of SDK startup and network calls.
import { homePath, loadConfig } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { validateHook, handleNativeHook } from '../src/native.ts';

const observedAt = Date.now();
let store;
let timer;
try {
  const provider = process.argv[2];
  if (!['codex', 'claude'].includes(provider)) throw new Error('Expected codex or claude.');
  if (process.env.BOHSELECTA_BYPASS === '1' || (provider === 'claude' && process.env.BOHSELECTA_CLAUDE_PREVIEW === '1')) { process.stdout.write('{}\n'); }
  else {
    const chunks = [];
    let size = 0;
    timer = setTimeout(() => { console.error('bohselecta: hook input timed out; continuing normally.'); process.stdout.write('{}\n'); process.exit(0); }, 2000);
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new Error('Hook input exceeds local routing limit.');
      chunks.push(chunk);
    }
    clearTimeout(timer);
    const input = validateHook(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const home = homePath();
    const config = loadConfig(home);
    store = new Store(home, config.retentionDays, 250);
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const output = handleNativeHook(provider, input, config, store, home, observedAt);
      store.db.exec('COMMIT');
      process.stdout.write(JSON.stringify(output) + '\n');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  }
} catch {
  // Never turn a router/storage/config error into a blocked user task; do not echo prompt data.
  console.error('bohselecta: routing unavailable; continuing with your current model. Run bohselecta native status.');
  process.stdout.write('{}\n');
} finally { clearTimeout(timer); store?.close(); }
