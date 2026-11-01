import { describe, expect, test } from 'bun:test';
import { SerialQueue } from './serial-queue';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('SerialQueue', () => {
  test('starts a task only after the one before it has finished', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const first = deferred();

    const a = queue.enqueue(async () => {
      log.push('a:start');
      await first.promise;
      log.push('a:end');
    });
    const b = queue.enqueue(async () => {
      log.push('b:start');
    });
    await Promise.resolve();
    expect(log).toEqual(['a:start']);

    first.resolve();
    await Promise.all([a, b]);

    expect(log).toEqual(['a:start', 'a:end', 'b:start']);
  });

  test('a slow older task cannot finish after a newer one', async () => {
    const queue = new SerialQueue();
    const finished: string[] = [];
    const slow = deferred();

    const older = queue.enqueue(async () => {
      await slow.promise;
      finished.push('older');
    });
    const newer = queue.enqueue(async () => {
      finished.push('newer');
    });
    slow.resolve();
    await Promise.all([older, newer]);

    expect(finished).toEqual(['older', 'newer']);
  });

  test('a failing task rejects for its caller but does not block later tasks', async () => {
    const queue = new SerialQueue();
    const ran: string[] = [];

    const failing = queue.enqueue(async () => {
      throw new Error('network down');
    });
    const later = queue.enqueue(async () => {
      ran.push('later');
      return 'ok';
    });

    await expect(failing).rejects.toThrow('network down');
    expect(await later).toBe('ok');
    expect(ran).toEqual(['later']);
  });
});
