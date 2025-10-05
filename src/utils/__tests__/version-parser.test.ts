import { parseVersion } from '../version-parser.js';

describe('parseVersion', () => {
  test('parses version with + separator', () => {
    expect(parseVersion('v1.0.0+20')).toEqual({
      version: '1.0.0',
      buildNumber: '20',
    });
  });

  test('parses version with parentheses', () => {
    expect(parseVersion('1.0.0(20)')).toEqual({
      version: '1.0.0',
      buildNumber: '20',
    });
  });

  test('parses version without v prefix', () => {
    expect(parseVersion('1.0.0+20')).toEqual({
      version: '1.0.0',
      buildNumber: '20',
    });
  });

  test('parses version with v prefix and parentheses', () => {
    expect(parseVersion('v1.0.0(20)')).toEqual({
      version: '1.0.0',
      buildNumber: '20',
    });
  });

  test('parses version only', () => {
    expect(parseVersion('1.0.0')).toEqual({
      version: '1.0.0',
    });
  });

  test('parses version with v prefix only', () => {
    expect(parseVersion('v1.0.0')).toEqual({
      version: '1.0.0',
    });
  });

  test('returns original string for invalid format', () => {
    expect(parseVersion('invalid')).toEqual({
      version: 'invalid',
    });
  });
});