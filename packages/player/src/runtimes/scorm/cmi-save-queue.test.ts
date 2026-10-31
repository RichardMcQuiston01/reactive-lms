import { describe, expect, test } from 'bun:test';
import type { ScormCmiDto } from '@richardmcquiston01/reactive-lms-shared';
import { CmiSaveQueue } from './cmi-save-queue';

const snap = (status: string, finished = false): ScormCmiDto => ({
  values: { 'cmi.core.lesson_status': status },
  finished,
});

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CmiSaveQueue', () => {
  test('sends a snapshot straight away when idle', async () => {
    const sent: ScormCmiDto[] = [];
    const queue = new CmiSaveQueue(async (body) => {
      sent.push(body);
    });

    const done = queue.save(snap('incomplete'));

    expect(sent).toHaveLength(1);
    await done;
    expect(queue.hasUnsaved).toBe(false);
  });

  test('a slow commit cannot land after the final save', async () => {
    const landed: string[] = [];
    const gates = [deferred(), deferred()];
    let call = 0;
    const queue = new CmiSaveQueue(async (body) => {
      const gate = gates[call];
      call += 1;
      await gate?.promise;
      landed.push(String(body.values['cmi.core.lesson_status']));
    });

    const first = queue.save(snap('incomplete'));
    const second = queue.save(snap('completed', true));
    // The second is held back until the first has finished.
    expect(call).toBe(1);

    gates[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[1]?.resolve();
    await Promise.all([first, second]);

    expect(landed).toEqual(['incomplete', 'completed']);
  });

  test('snapshots waiting behind an in-flight save collapse to the newest', async () => {
    const sent: string[] = [];
    const gate = deferred();
    let first = true;
    const queue = new CmiSaveQueue(async (body) => {
      sent.push(String(body.values['cmi.core.lesson_status']));
      if (first) {
        first = false;
        await gate.promise;
      }
    });

    const a = queue.save(snap('a'));
    void queue.save(snap('b'));
    void queue.save(snap('c'));
    gate.resolve();
    await a;

    expect(sent).toEqual(['a', 'c']);
  });

  test('a replaced snapshot cannot un-finish a finished one', async () => {
    const sent: ScormCmiDto[] = [];
    const gate = deferred();
    let first = true;
    const queue = new CmiSaveQueue(async (body) => {
      sent.push(body);
      if (first) {
        first = false;
        await gate.promise;
      }
    });

    const a = queue.save(snap('incomplete'));
    void queue.save(snap('completed', true));
    void queue.save(snap('completed', false));
    gate.resolve();
    await a;

    expect(sent[sent.length - 1]?.finished).toBe(true);
  });

  test('a failed save keeps its snapshot, reports the error, and is retried', async () => {
    const errors: string[] = [];
    let recovered = 0;
    let attempts = 0;
    const sent: string[] = [];
    const queue = new CmiSaveQueue(
      async (body) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('offline');
        }
        sent.push(String(body.values['cmi.core.lesson_status']));
      },
      {
        onError: (error) => errors.push((error as Error).message),
        onRecovered: () => {
          recovered += 1;
        },
      },
    );

    await queue.save(snap('completed', true));
    expect(errors).toEqual(['offline']);
    expect(queue.hasUnsaved).toBe(true);
    expect(recovered).toBe(0);

    await queue.retry();

    expect(sent).toEqual(['completed']);
    expect(queue.hasUnsaved).toBe(false);
    expect(recovered).toBe(1);
  });

  test('after a failure the next save sends the newest state, finished flag kept', async () => {
    let attempts = 0;
    const sent: ScormCmiDto[] = [];
    const queue = new CmiSaveQueue(async (body) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('offline');
      }
      sent.push(body);
    });

    await queue.save(snap('completed', true));
    await queue.save(snap('completed', false));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.finished).toBe(true);
  });

  test('never rejects, even when every save fails', async () => {
    const queue = new CmiSaveQueue(async () => {
      throw new Error('down');
    });

    await expect(queue.save(snap('x'))).resolves.toBeUndefined();
    await expect(queue.retry()).resolves.toBeUndefined();
    expect(queue.hasUnsaved).toBe(true);
  });

  test('does not report recovery for a save that never failed', async () => {
    let recovered = 0;
    const queue = new CmiSaveQueue(async () => undefined, {
      onRecovered: () => {
        recovered += 1;
      },
    });

    await queue.save(snap('x'));

    expect(recovered).toBe(0);
  });

  test('retry while a save is in flight tries once more if that save fails', async () => {
    let attempts = 0;
    const sent: string[] = [];
    const gate = deferred();
    const queue = new CmiSaveQueue(async (body) => {
      attempts += 1;
      if (attempts === 1) {
        await gate.promise;
        throw new Error('offline');
      }
      sent.push(String(body.values['cmi.core.lesson_status']));
    });

    void queue.save(snap('completed', true));
    const retrying = queue.retry();
    gate.resolve();
    await retrying;

    expect(attempts).toBe(2);
    expect(sent).toEqual(['completed']);
    expect(queue.hasUnsaved).toBe(false);
  });

  test('retry on an idle queue makes a single attempt', async () => {
    let attempts = 0;
    const queue = new CmiSaveQueue(async () => {
      attempts += 1;
      throw new Error('down');
    });
    await queue.save(snap('x'));
    attempts = 0;

    await queue.retry();

    expect(attempts).toBe(1);
  });
});
