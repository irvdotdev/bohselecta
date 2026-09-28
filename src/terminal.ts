import { createInterface, type Interface } from 'node:readline/promises';
import { stripVTControlCharacters } from 'node:util';
import type { IO } from './types.ts';

export function safeText(s: string) { return stripVTControlCharacters(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); }
export class Terminal implements IO {
  rl?: Interface;
  closed = false;
  onInterrupt: () => void = () => {};
  pending: Promise<unknown> = Promise.resolve();
  constructor(interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)) {
    if (interactive) {
      this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      this.rl.on('SIGINT', () => this.onInterrupt());
      this.rl.on('close', () => { this.closed = true; this.onInterrupt(); });
    }
  }
  text(text: string) { process.stdout.write(safeText(text)); }
  notice(text: string) { process.stderr.write('\n' + safeText(text) + '\n'); }
  ask(prompt: string, signal?: AbortSignal): Promise<string> {
    const result = this.pending.then(async () => {
      if (!this.rl || this.closed) throw new Error('Interactive input is required. Run in a terminal; for model selection use --choose or --model. Tool permissions are never auto-approved.');
      signal?.throwIfAborted();
      return this.rl.question(safeText(prompt), { signal });
    });
    this.pending = result.catch(() => {}); return result;
  }
  close() { this.rl?.close(); }
}
