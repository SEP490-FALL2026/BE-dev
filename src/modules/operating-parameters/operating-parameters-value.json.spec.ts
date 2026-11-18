import { JsonColumnShapeError } from '../../infrastructure/database/json-column.errors';
import { operatingParameterValueJson } from './operating-parameters-value.json';

describe('operatingParameterValueJson (parameter_values.value)', () => {
  it('reads a whole number, a word, or a list of whole numbers', () => {
    expect(operatingParameterValueJson.decode(7)).toBe(7);
    expect(operatingParameterValueJson.decode('WEEKLY')).toBe('WEEKLY');
    expect(operatingParameterValueJson.decode([30, 15, 7])).toEqual([30, 15, 7]);
    expect(operatingParameterValueJson.decode([])).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an object', { days: 7 }],
    ['a boolean', true],
    ['a list with a word in it', [30, 'soon']],
    ['a list with a list in it', [[1]]],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => operatingParameterValueJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => operatingParameterValueJson.decode(value)).toThrow('parameter_values.value');
    expect(() => operatingParameterValueJson.decode(value)).not.toThrow(/soon/);
  });

  it('writes the value as it has always been written: itself', () => {
    expect(operatingParameterValueJson.encode(7)).toBe(7);
    expect(operatingParameterValueJson.encode('DAILY')).toBe('DAILY');
    expect(operatingParameterValueJson.encode([30, 15, 7])).toEqual([30, 15, 7]);
  });
});
