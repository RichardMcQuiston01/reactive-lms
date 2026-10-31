import { describe, expect, test } from 'bun:test';
import { isContentFrameMessage } from './is-content-frame-message';

const frame = {} as Window;

describe('isContentFrameMessage', () => {
  test('accepts a message from the content iframe', () => {
    expect(
      isContentFrameMessage(
        { source: frame, origin: 'http://localhost:3000' },
        frame,
        '/lms/content/packages/p/content/index.html',
        'http://localhost:3000/',
      ),
    ).toBe(true);
  });

  test('rejects a message from another window', () => {
    const other = {} as Window;
    expect(
      isContentFrameMessage(
        { source: other, origin: 'http://localhost:3000' },
        frame,
        '/lms/content/packages/p/content/index.html',
        'http://localhost:3000/',
      ),
    ).toBe(false);
  });

  test('rejects a matching window with the wrong origin', () => {
    expect(
      isContentFrameMessage(
        { source: frame, origin: 'https://evil.example' },
        frame,
        'https://lms.example/lms/content/index.html',
        'https://lms.example/',
      ),
    ).toBe(false);
  });
});
