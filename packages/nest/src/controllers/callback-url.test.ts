import { describe, expect, test } from 'bun:test';
import { callbackBaseUrl } from './callback-url';

const request = (
  originalUrl: string,
  protocol = 'https',
  host: string | null = 'lms.example.com',
) => ({
  originalUrl,
  protocol,
  get: (name: string) => (name === 'host' ? (host ?? undefined) : undefined),
});

describe('callbackBaseUrl', () => {
  test('is the request origin plus the route prefix, whatever the prefix is', () => {
    expect(callbackBaseUrl(request('/lms/registrations/r1/launches'))).toBe(
      'https://lms.example.com/lms',
    );
    expect(
      callbackBaseUrl(request('/api/v2/lms/registrations/r1/launches?x=1')),
    ).toBe('https://lms.example.com/api/v2/lms');
    expect(
      callbackBaseUrl(
        request('/registrations/r1/launches', 'http', 'localhost:3000'),
      ),
    ).toBe('http://localhost:3000');
  });

  test('uses publicBaseUrl for the origin when the host sets one, ignoring a trailing slash', () => {
    expect(
      callbackBaseUrl(
        request('/lms/registrations/r1/launches', 'http', 'internal:3000'),
        'https://public.example.com/',
      ),
    ).toBe('https://public.example.com/lms');
  });

  test('accepts an IPv6 host and a port', () => {
    expect(
      callbackBaseUrl(
        request('/lms/registrations/r/launches', 'http', '[::1]:3000'),
      ),
    ).toBe('http://[::1]:3000/lms');
  });

  test.each([
    ['a host with a path', 'evil.com/x'],
    ['a host with credentials', 'a@evil.com'],
    ['a host with a space', 'evil .com'],
    ['a missing host', null],
  ])('is undefined for %s', (_name, host) => {
    expect(
      callbackBaseUrl(request('/lms/registrations/r/launches', 'https', host)),
    ).toBeUndefined();
  });

  test('is undefined when the request is not a launch, or the protocol is odd', () => {
    expect(callbackBaseUrl(request('/lms/packages'))).toBeUndefined();
    expect(
      callbackBaseUrl(request('/lms/registrations/r/launches', 'ftp')),
    ).toBeUndefined();
    expect(callbackBaseUrl(undefined)).toBeUndefined();
    expect(callbackBaseUrl({})).toBeUndefined();
  });
});
