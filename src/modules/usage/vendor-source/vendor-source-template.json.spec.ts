import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { usageSourceTemplateJson } from './vendor-source-template.json';
import type { SourceTemplate } from './vendor-source.types';

const template: SourceTemplate = {
  columns: { identifier: 'email', date: 'day', eventType: 'event' },
  eventClasses: { open: 'VALUE', view: 'PASSIVE', login: 'AUTH_ONLY', ping: 'IGNORED' },
};

describe('usageSourceTemplateJson (usage_sources.template)', () => {
  it('reads a template as the domain type, an aggregated one with no event classes included', () => {
    expect(usageSourceTemplateJson.decode(JSON.parse(JSON.stringify(template)))).toEqual(template);
    expect(usageSourceTemplateJson.decode({ columns: { identifier: 'user', lastActivityDate: 'last' } })).toEqual({
      columns: { identifier: 'user', lastActivityDate: 'last' },
      eventClasses: {},
    });
  });

  it.each([
    ['a missing identifier column', { columns: {}, eventClasses: {} }],
    ['a class that does not exist', { columns: { identifier: 'a' }, eventClasses: { x: 'ACTIVE' } }],
    ['an unknown key', { columns: { identifier: 'a', extra: 'b' }, eventClasses: {} }],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => usageSourceTemplateJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => usageSourceTemplateJson.decode(value)).toThrow('usage_sources.template');
  });

  it('writes the template as it is, key for key', () => {
    expect(usageSourceTemplateJson.encode(template)).toEqual(template);
  });
});
