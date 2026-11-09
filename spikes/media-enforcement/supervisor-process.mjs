import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { SupervisorState } from './supervisor-state.mjs';

const exec = promisify(execFile);
const [context, containerId, epoch] = process.argv.slice(2);
if (!context || !/^[a-f0-9]{64}$/.test(containerId ?? '') || !epoch)
  throw new Error('Usage: node supervisor-process.mjs CONTEXT FULL_CONTAINER_ID EPOCH');
const docker = async (...args) =>
  (
    await exec('docker', ['--context', context, ...args], { timeout: 1500, maxBuffer: 65536 })
  ).stdout.trim();
const inspected = JSON.parse(await docker('inspect', containerId))[0];
if (
  inspected.Config.Labels?.['gather.cp07.fixture'] !== 'true' ||
  inspected.HostConfig.RestartPolicy.Name !== 'no'
)
  throw new Error('Target must be an explicitly labelled CP07 fixture with restart disabled.');
const started = performance.now();
const supervisor = new SupervisorState({
  epoch,
  clock: () => performance.now(),
  stop: async () => {
    if ((await docker('inspect', '--format', '{{.State.Running}}', containerId)) === 'false')
      return true;
    await docker('kill', '--signal', 'KILL', containerId);
    return (await docker('inspect', '--format', '{{.State.Running}}', containerId)) === 'false';
  },
});
// Private parent pipe only. This fixture protocol is not an authenticated production guard API.
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  if (line.length > 4096) return;
  try {
    const message = JSON.parse(line);
    if (message.kind === 'expect') supervisor.expectInstallation(message);
    else if (message.kind === 'ack') supervisor.acknowledge(message);
  } catch {
    /* Invalid progress never renews the watchdog. */
  }
});
let checking = false;
const timer = setInterval(async () => {
  if (checking) return;
  checking = true;
  const state = await supervisor.check();
  checking = false;
  if (state !== 'healthy')
    process.stdout.write(JSON.stringify({ state, elapsedMs: performance.now() - started }) + '\n');
  if (state === 'stopped') {
    clearInterval(timer);
    input.close();
    process.stdin.destroy();
  }
}, 50);
