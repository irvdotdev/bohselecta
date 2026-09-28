#!/usr/bin/env node
// Observe only the configured model. Never persist status-line payloads or read transcripts.
import { spawnSync } from 'node:child_process';
import { homePath } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { observeModel, statuslineModel } from '../src/native-model.ts';

const at = Date.now();
let previous;
let timer;
try {
  if (process.argv[2] !== '--previous') throw new Error('Missing status-line configuration.');
  previous = JSON.parse(Buffer.from(process.argv[3], 'base64').toString('utf8'));
  const chunks = [];
  let size = 0;
  timer = setTimeout(() => process.exit(0), 2000);
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Input too large.');
    chunks.push(chunk);
  }
  clearTimeout(timer);
  const input = Buffer.concat(chunks);
  let current;
  try { current = statuslineModel(JSON.parse(input.toString('utf8'))); } catch {}
  if (current && process.env.BOHSELECTA_BYPASS !== '1') {
    let store;
    try {
      store = new Store(homePath(), 0, 100);
      store.db.exec('BEGIN IMMEDIATE');
      observeModel(store, 'claude', current.session, current.model, 'statusline', at);
      store.db.exec('COMMIT');
    } catch { /* A busy or unavailable database must not break the existing footer. */ }
    finally { store?.close(); }
  }
  if (previous?.type === 'command' && typeof previous.command === 'string') {
    // This is the user's pre-existing configured command; stdin is passed as data.
    const result = spawnSync('/bin/sh', ['-c', previous.command], { input, timeout: 4000, maxBuffer: 1024 * 1024, cwd: process.cwd(), env: process.env });
    if (result.stdout) process.stdout.write(result.stdout);
  } else if (process.env.BOHSELECTA_BYPASS !== '1') {
    process.stdout.write(`bohselecta · ${current?.model ?? 'waiting for model'}\n`);
  }
} catch { /* Footer failures must never affect task execution or expose input. */ }
finally { clearTimeout(timer); }
