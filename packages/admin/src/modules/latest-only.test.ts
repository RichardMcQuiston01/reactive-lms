import { describe, expect, test } from 'bun:test';
import { LatestOnly, type LoadOutcome } from './latest-only';

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

describe('LatestOnly.load', () => {
  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (failure: unknown) => void;
  } {
    let resolve!: (value: T) => void;
    let reject!: (failure: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function recorder(): {
    state: { data: string; error: string; settled: number };
    outcome: LoadOutcome<string>;
  } {
    const state = { data: '', error: '', settled: 0 };
    return {
      state,
      outcome: {
        onData: (value) => {
          state.data = value;
        },
        onFailure: (failure) => {
          state.error = String(failure);
        },
        onSettled: () => {
          state.settled += 1;
        },
      },
    };
  }

  test('applies data, then settles, for the only request', async () => {
    const { state, outcome } = recorder();
    await new LatestOnly().load(async () => 'only', outcome);
    expect(state).toEqual({ data: 'only', error: '', settled: 1 });
  });

  test('reports a failure of the only request', async () => {
    const { state, outcome } = recorder();
    await new LatestOnly().load(
      () => Promise.reject(new Error('boom')),
      outcome,
    );
    expect(state.error).toBe('Error: boom');
    expect(state.settled).toBe(1);
  });

  test('a stale success changes nothing while a newer request is pending', async () => {
    const guard = new LatestOnly();
    const { state, outcome } = recorder();
    const older = deferred<string>();
    const newer = deferred<string>();

    const first = guard.load(() => older.promise, outcome);
    const second = guard.load(() => newer.promise, outcome);
    older.resolve('older');
    await first;

    expect(state).toEqual({ data: '', error: '', settled: 0 });
    newer.resolve('newer');
    await second;
    expect(state).toEqual({ data: 'newer', error: '', settled: 1 });
  });

  test('a stale failure shows no error and does not end loading', async () => {
    const guard = new LatestOnly();
    const { state, outcome } = recorder();
    const older = deferred<string>();
    const newer = deferred<string>();

    const first = guard.load(() => older.promise, outcome);
    const second = guard.load(() => newer.promise, outcome);
    older.reject(new Error('old failure'));
    await first;

    expect(state).toEqual({ data: '', error: '', settled: 0 });
    newer.resolve('newer');
    await second;
    expect(state).toEqual({ data: 'newer', error: '', settled: 1 });
  });

  test('a stale request finishing last does not overwrite the newer result', async () => {
    const guard = new LatestOnly();
    const { state, outcome } = recorder();
    const older = deferred<string>();
    const newer = deferred<string>();

    const first = guard.load(() => older.promise, outcome);
    const second = guard.load(() => newer.promise, outcome);
    newer.resolve('newer');
    await second;
    older.resolve('older');
    await first;

    expect(state).toEqual({ data: 'newer', error: '', settled: 1 });
  });
});
