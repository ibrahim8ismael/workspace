/** Separate crash-enforcement process for one labelled experimental SFU. */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
const [context, id, epoch] = process.argv.slice(2);
if (!context || !/^[a-f0-9]{64}$/.test(id ?? '') || !epoch) throw Error('invalid guardian target');
const exec = promisify(execFile);
const docker = async (...args) =>
  (
    await exec('docker', ['--context', context, ...args], { timeout: 1500, maxBuffer: 65536 })
  ).stdout.trim();
const target = JSON.parse(await docker('inspect', id))[0];
if (
  target.Config.Labels?.['gather.cp07.fixture'] !== 'true' ||
  target.HostConfig.RestartPolicy.Name !== 'no'
)
  throw Error('unsafe guardian target');
const child = spawn(
  process.execPath,
  [new URL('./supervisor-process.mjs', import.meta.url).pathname, context, id, epoch],
  {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      ...(process.argv.includes('--deny-primary-stop') ? { CP07_FIXTURE_DENY_STOP: '1' } : {}),
    },
  },
);
process.stdin.pipe(child.stdin);
child.stdin.on('error', () => {});
child.stdout.pipe(process.stdout);
let pending = '';
child.stdout.on('data', (chunk) => {
  pending += chunk.toString();
  const lines = pending.split('\n');
  pending = lines.pop();
  for (const line of lines) {
    try {
      if (JSON.parse(line).state === 'stop-unconfirmed') child.kill('SIGTERM');
    } catch {
      /* Rejected fixture input or unavailable probe; never grants progress. */
    }
  }
});
process.stdout.write(JSON.stringify({ kind: 'worker-started', pid: child.pid }) + '\n');
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(143);
});
const outcome = await new Promise((resolve) => {
  child.on('exit', (code, signal) => resolve({ code, signal }));
  child.on('error', () => resolve({ code: -1 }));
});
const started = performance.now();
// A surviving process independently enforces stop on child death. No guard-selected command/target.
while (true) {
  try {
    if ((await docker('inspect', '--format', '{{.State.Running}}', id)) !== 'false')
      await docker('kill', '--signal', 'KILL', id);
    if ((await docker('inspect', '--format', '{{.State.Running}}', id)) === 'false') {
      process.stdout.write(
        JSON.stringify({
          kind: 'guardian-stopped',
          workerExit: outcome,
          elapsedMs: performance.now() - started,
        }) + '\n',
      );
      process.stdin.destroy();
      break;
    }
  } catch {
    process.stdout.write(JSON.stringify({ kind: 'guardian-stop-unconfirmed' }) + '\n');
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
