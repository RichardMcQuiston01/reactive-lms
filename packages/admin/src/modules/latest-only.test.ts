import { describe, expect, test } from 'bun:test';
import { LatestOnly } from './latest-only';

describe('LatestOnly', () => {
  test('a lone request is current', () => {
    expect(new LatestOnly().begin()()).toBe(true);
  });

  test('an older request becomes stale once a newer one begins', () => {
    const guard = new LatestOnly();
    const first = guard.begin();
    const second = guard.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  test('keeps the newest result when responses arrive out of order', async () => {
    const guard = new LatestOnly();
    let shown = '';
    const load = async (label: string, delayMs: number): Promise<void> => {
      const isCurrent = guard.begin();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (isCurrent()) {
        shown = label;
      }
    };

    await Promise.all([load('older', 20), load('newer', 1)]);

    expect(shown).toBe('newer');
  });
});
