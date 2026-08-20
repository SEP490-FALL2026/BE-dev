import { parseCorsOrigins, validateProductionCorsOrigins } from './cors';

describe('CORS configuration', () => {
  it('normalizes comma-separated exact origins', () => {
    expect(parseCorsOrigins(' http://localhost:5173/, https://licenses.example.com ')).toEqual([
      'http://localhost:5173',
      'https://licenses.example.com',
    ]);
  });

  it.each(['', '*', 'http://licenses.example.com', 'https://licenses.example.com/path'])(
    'rejects an unsafe production allow-list: %s',
    (raw) => {
      expect(() => validateProductionCorsOrigins(parseCorsOrigins(raw))).toThrow('CORS_ORIGINS');
    },
  );

  it('accepts an exact HTTPS production allow-list', () => {
    expect(() => validateProductionCorsOrigins(['https://licenses.example.com'])).not.toThrow();
  });
});
