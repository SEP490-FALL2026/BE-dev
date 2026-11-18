import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { heldNotificationParamsJson, inAppNotificationParamsJson } from './notification-params.json';

describe.each([
  ['inAppNotificationParamsJson', inAppNotificationParamsJson, 'in_app_notifications.params'],
  ['heldNotificationParamsJson', heldNotificationParamsJson, 'held_department_notifications.params'],
])('%s (%s)', (_name, codec, where) => {
  it('reads flat parameters: text, numbers, booleans and null', () => {
    const params = { openCount: 3, urgent: true, note: null, holderEmployeeId: 'e-1' };

    expect(codec.decode(params)).toEqual(params);
    expect(codec.decode({})).toEqual({});
  });

  it.each([
    ['a parameter that is a list', { ids: ['a', 'b'] }],
    ['a parameter that is an object', { by: { name: 'Ana' } }],
    ['a list instead of an object', ['a']],
    ['null', null],
    ['a bare string', 'STEP_BACKLOG_ALERT'],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => codec.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => codec.decode(value)).toThrow(where);
    expect(() => codec.decode(value)).not.toThrow(/Ana|STEP_BACKLOG_ALERT/);
  });

  it('writes the parameters as they have always been written: the object itself', () => {
    expect(codec.encode({ openCount: 3, note: null })).toEqual({ openCount: 3, note: null });
  });
});
