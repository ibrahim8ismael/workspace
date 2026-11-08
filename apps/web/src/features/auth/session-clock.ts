import type { SessionDto } from '../../lib/api';

export const SESSION_WARNING_WINDOW_MS = 5 * 60 * 1000;

export type SessionDeadlineState = 'unknown' | 'active' | 'warning' | 'expired';

export function effectiveSessionDeadline(
  session: Pick<SessionDto, 'idleExpiresAt' | 'absoluteExpiresAt'> | null,
): number | null {
  if (!session) return null;
  const idle = Date.parse(session.idleExpiresAt);
  const absolute = Date.parse(session.absoluteExpiresAt);
  if (!Number.isFinite(idle) || !Number.isFinite(absolute)) return null;
  return Math.min(idle, absolute);
}

export function sessionDeadlineState(deadline: number | null, now: number): SessionDeadlineState {
  if (deadline === null || !Number.isFinite(deadline)) return 'unknown';
  const remaining = deadline - now;
  if (remaining <= 0) return 'expired';
  if (remaining <= SESSION_WARNING_WINDOW_MS) return 'warning';
  return 'active';
}

export type CurrentSessionResolution =
  | { kind: 'current'; session: SessionDto }
  | { kind: 'missing' }
  | { kind: 'multiple' }
  | { kind: 'changed'; session: SessionDto };

export function resolveCurrentSession(
  sessions: SessionDto[],
  expectedId: string | null,
): CurrentSessionResolution {
  const current = sessions.filter((session) => session.current);
  if (current.length === 0) return { kind: 'missing' };
  if (current.length > 1) return { kind: 'multiple' };
  const [session] = current;
  if (!session) return { kind: 'missing' };
  if (expectedId && expectedId !== session.id) return { kind: 'changed', session };
  return { kind: 'current', session };
}
