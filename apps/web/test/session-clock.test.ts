import { describe, expect, it } from 'vitest';
import {
  effectiveSessionDeadline,
  resolveCurrentSession,
  sessionDeadlineState,
  SESSION_WARNING_WINDOW_MS,
} from '../src/features/auth/session-clock';

const current = {
  id: 'df92b3ad-d3e9-430d-82f5-6e91cbe9dfe2',
  current: true,
  createdAt: '2026-11-09T00:00:00.000Z',
  idleExpiresAt: '2026-11-09T01:00:00.000Z',
  absoluteExpiresAt: '2026-11-09T12:00:00.000Z',
};

describe('session lifetime estimates', () => {
  it('caps the idle deadline at absolute expiry', () => {
    expect(effectiveSessionDeadline(current)).toBe(Date.parse(current.idleExpiresAt));
    expect(
      effectiveSessionDeadline({
        ...current,
        idleExpiresAt: '2026-11-09T13:00:00.000Z',
      }),
    ).toBe(Date.parse(current.absoluteExpiresAt));
    expect(effectiveSessionDeadline(null)).toBeNull();
  });

  it('warns within five minutes and marks the estimated deadline as expired', () => {
    const deadline = Date.parse(current.idleExpiresAt);
    expect(sessionDeadlineState(deadline, deadline - SESSION_WARNING_WINDOW_MS - 1)).toBe('active');
    expect(sessionDeadlineState(deadline, deadline - SESSION_WARNING_WINDOW_MS)).toBe('warning');
    expect(sessionDeadlineState(deadline, deadline - 1)).toBe('warning');
    expect(sessionDeadlineState(deadline, deadline)).toBe('expired');
    expect(sessionDeadlineState(null, deadline)).toBe('unknown');
  });

  it('requires exactly one current row and detects unexpected session changes', () => {
    const other = { ...current, id: '0572e96c-f236-4bb1-8d8c-08b8bfda8937', current: false };
    expect(resolveCurrentSession([other], current.id)).toEqual({ kind: 'missing' });
    expect(resolveCurrentSession([current, { ...other, current: true }], current.id).kind).toBe(
      'multiple',
    );
    expect(resolveCurrentSession([{ ...current, id: other.id }], current.id).kind).toBe('changed');
    expect(resolveCurrentSession([current], current.id)).toEqual({
      kind: 'current',
      session: current,
    });
  });
});
