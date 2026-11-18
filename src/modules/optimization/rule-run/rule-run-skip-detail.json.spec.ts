import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { ruleSkipDetailJson } from './rule-run-skip-detail.json';

describe('rule skip detail codec', () => {
  it('writes and reads the facts that decided a skip', () => {
    const detail = { pricingModel: null, provisioningType: 'K2' };

    expect(ruleSkipDetailJson.encode(detail)).toEqual(detail);
    expect(ruleSkipDetailJson.decode(detail)).toEqual(detail);
    expect(ruleSkipDetailJson.decode({})).toEqual({});
  });

  it('refuses a key it does not know and a recommendation that is not an id', () => {
    expect(() => ruleSkipDetailJson.decode({ note: 'x' })).toThrow(JsonColumnShapeError);
    expect(() => ruleSkipDetailJson.decode({ recommendationId: 'not-an-id' })).toThrow(JsonColumnShapeError);
  });
});
