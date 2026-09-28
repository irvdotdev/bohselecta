import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class Rpc extends EventEmitter {
  child: ChildProcessWithoutNullStreams;
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  nextId = 0;
  closed = false;
  stderr = '';
  handler?: (method: string, params: any) => Promise<unknown>;
  constructor(command: string, args: string[], cwd: string) {
    super();
    this.child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.child.stderr.on('data', b => { this.stderr = (this.stderr + b).slice(-4000); });
    this.child.stdin.on('error', e => this.fail(e));
    this.child.on('error', e => this.fail(e));
    this.child.on('exit', (code, signal) => this.fail(new Error(`Client exited (${signal ?? code}). ${this.stderr.trim()}`)));
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      try { this.receive(JSON.parse(line)); }
      catch (e) { this.fail(new Error(`Invalid client protocol output: ${(e as Error).message}`)); }
    });
  }
  private receive(msg: any) {
    if (msg.method && msg.id !== undefined) {
      Promise.resolve().then(() => {
        if (!this.handler) throw new Error(`Unsupported client request: ${msg.method}`);
        return this.handler(msg.method, msg.params);
      }).then(result => this.send({ id: msg.id, result }), error => this.send({ id: msg.id, error: { code: -32601, message: error.message } })).catch(() => {});
    } else if (msg.id !== undefined) {
      const p = this.pending.get(msg.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    } else if (msg.method) this.emit('notification', msg.method, msg.params);
  }
  send(message: unknown) {
    if (this.closed) throw new Error('Client connection is closed.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method: string, params: unknown, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('Client connection is closed.')); return; }
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Client timed out: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.emit('fatal', error);
    this.child.kill();
  }
  async close() {
    if (this.closed) return;
    this.fail(new Error('Client connection closed.'));
    const child = this.child;
    if (child.exitCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
