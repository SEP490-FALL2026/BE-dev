import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { policyContentJson, type PolicyContent } from './library.json';

const content: PolicyContent = {
  sections: [{ heading: 'Mục đích', body: 'Cấp đúng công cụ.' }],
  steps: [
    {
      code: '1.2',
      title: 'Xác nhận nhu cầu',
      checklist: [
        { code: '1.2-01', text: 'Người quyết là trưởng phòng hiệu lực', check: 'SYSTEM' },
        { code: '1.2-04', text: 'Nhu cầu gắn với công việc hiện tại', check: 'PERSON' },
      ],
    },
  ],
};

describe('policyContentJson (policy_versions.content)', () => {
  it('reads what it writes', () => {
    expect(policyContentJson.decode(policyContentJson.encode(content))).toEqual(content);
  });

  it('accepts a policy that has sections and no step', () => {
    expect(policyContentJson.decode({ sections: [{ heading: 'a', body: 'b' }], steps: [] }).steps).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a list', []],
    ['a step with no item', { sections: [], steps: [{ code: '1.2', title: 't', checklist: [] }] }],
    [
      'an item that is neither SYSTEM nor PERSON',
      { sections: [], steps: [{ code: '1', title: 't', checklist: [{ code: 'a', text: 't', check: 'ROBOT' }] }] },
    ],
    ['a field nobody defined', { sections: [], steps: [], extra: 1 }],
    [
      'two steps of the same code',
      {
        sections: [],
        steps: [
          { code: '1.2', title: 'a', checklist: [{ code: 'a', text: 't', check: 'PERSON' }] },
          { code: '1.2', title: 'b', checklist: [{ code: 'b', text: 't', check: 'PERSON' }] },
        ],
      },
    ],
    [
      'two items of the same code in one policy',
      {
        sections: [],
        steps: [
          { code: '1.2', title: 'a', checklist: [{ code: 'a', text: 't', check: 'PERSON' }] },
          { code: '1.6', title: 'b', checklist: [{ code: 'a', text: 't', check: 'PERSON' }] },
        ],
      },
    ],
  ])('refuses %s with the table and the column, and never the text', (_label, value) => {
    expect(() => policyContentJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => policyContentJson.decode(value)).toThrow('policy_versions.content');
  });
});
