import { describe, expect, it } from 'vitest';
import { MovementIntentSender } from '../src/features/office/movement-intent-sender';

describe('MovementIntentSender', () => {
  it('caps bursts below the server rate budget and allows another input after the window', () => {
    const sent: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }[] = [];
    const sender = new MovementIntentSender((direction) => sent.push(direction));

    for (let index = 0; index < 40; index++)
      sender.trySend({ dx: index % 2 ? 1 : -1, dy: 0 }, index * 20);

    expect(sent).toHaveLength(28);
    expect(sender.trySend({ dx: 0, dy: 0 }, 1000)).toBe(true);
    expect(sent.at(-1)).toEqual({ dx: 0, dy: 0 });
  });

  it('reserves two commands for immediate stop and caps total traffic at thirty', () => {
    const sent: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }[] = [];
    const sender = new MovementIntentSender((direction) => sent.push(direction));
    for (let index = 0; index < 28; index++)
      sender.trySend({ dx: index % 2 ? 1 : -1, dy: 0 }, index * 10);

    expect(sender.trySend({ dx: 0, dy: 0 }, 280)).toBe(true);
    expect(sender.trySend({ dx: 1, dy: 0 }, 300)).toBe(false);
    expect(sender.trySend({ dx: 0, dy: 0 }, 320)).toBe(true);
    expect(sender.trySend({ dx: 0, dy: 0 }, 340)).toBe(false);
    expect(sent).toHaveLength(30);
    expect(sender.trySend({ dx: 1, dy: 0 }, 1020)).toBe(true);
    expect(sent.at(-1)).toEqual({ dx: 1, dy: 0 });
  });
});
