import { distinctUuids } from './uuid';

describe('distinctUuids', () => {
  const A = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const B = '00000000-0000-0000-0000-000000000001';

  it('keeps each well-formed id once, in the order first seen, whatever its case', () => {
    expect(distinctUuids([A, B, A, A.toUpperCase()])).toEqual([A, B, A.toUpperCase()]);
  });

  it('drops what is not a uuid so a query by id never fails on a cast', () => {
    expect(distinctUuids(['', 'not-a-uuid', `${A}x`, ` ${A}`, '123', A])).toEqual([A]);
  });

  it('answers an empty list for an empty list', () => {
    expect(distinctUuids([])).toEqual([]);
  });
});
