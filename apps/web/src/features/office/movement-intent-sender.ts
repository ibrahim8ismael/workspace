export type MovementDirection = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

/** Keeps latest-state movement traffic below the server's 30/s budget with stop capacity reserved. */
export class MovementIntentSender {
  private readonly sentAt: number[] = [];

  constructor(private readonly send: (direction: MovementDirection) => void) {}

  trySend(direction: MovementDirection, now: number): boolean {
    while (this.sentAt.length && now - this.sentAt[0]! >= 1000) this.sentAt.shift();
    const isStop = direction.dx === 0 && direction.dy === 0;
    if (this.sentAt.length >= (isStop ? 30 : 28)) return false;
    this.sentAt.push(now);
    this.send(direction);
    return true;
  }
}
