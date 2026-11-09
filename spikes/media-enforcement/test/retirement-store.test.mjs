import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RetirementStore } from '../retirement-store.mjs';
import { PermitState } from '../permit-state.mjs';
test('retirement survives a new guard epoch and rejects future policy snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp07-retirement-'));
  try {
    new RetirementStore(dir).retire('old-generation');
    const store = new RetirementStore(dir);
    assert.equal(store.has('old-generation'), true);
    store.retire('old-generation');
    const guard = new PermitState('new-epoch', () => 0, store);
    const pull = guard.beginPull('fresh-nonce');
    assert.equal(
      guard.install({
        ...pull,
        sequence: 1,
        permits: [
          {
            generation: 'old-generation',
            identity: 'u',
            room: 'r',
            version: 1,
            sources: ['microphone'],
          },
        ],
      }),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('unknown or incomplete persisted state prevents startup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cp07-retirement-'));
  try {
    writeFileSync(join(dir, '0'.repeat(64) + '.json'), '{');
    assert.throws(() => new RetirementStore(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persistence failure immediately denies existing permits in memory', () => {
  const guard = new PermitState('epoch', () => 0, {
    has: () => false,
    retire: () => {
      throw new Error('disk unavailable');
    },
  });
  const query = { generation: 'g', identity: 'u', room: 'r', version: 1, source: 'microphone' };
  const pull = guard.beginPull('n');
  assert.equal(
    guard.install({ ...pull, sequence: 1, permits: [{ ...query, sources: ['microphone'] }] }),
    true,
  );
  assert.equal(guard.allows(query), true);
  assert.throws(() => guard.retire('g'));
  assert.equal(guard.allows(query), false);
});
