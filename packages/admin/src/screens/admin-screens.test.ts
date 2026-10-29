import { describe, expect, test } from 'bun:test';
import { pickScreen } from './admin-screens';

class BuiltIn {}
class Custom {}

describe('pickScreen', () => {
  test('uses the built-in screen without an override', () => {
    expect(pickScreen('packages', BuiltIn, undefined)).toBe(BuiltIn);
    expect(pickScreen('packages', BuiltIn, { sections: Custom })).toBe(BuiltIn);
  });

  test('prefers the host override', () => {
    expect(pickScreen('packages', BuiltIn, { packages: Custom })).toBe(Custom);
  });
});
