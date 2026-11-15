import { CarriedOverContributions } from '../../budgets/public/budgets.extension-points';
import { CarriedOverListener } from './carried-over.listener';

describe('CarriedOverListener (QĐ-111ac: the requests tell the budgets what a Cost Center carries into the year)', () => {
  it('QĐ-111ac: adds itself to the contributions of the budgets when the module starts, and answers with the dry run of the pass of 01/01', async () => {
    const contributions = new CarriedOverContributions();
    const carried = { carriedOverOf: jest.fn().mockResolvedValue(new Map([['cc-1', 123_000_000n]])) };
    const listener = new CarriedOverListener(contributions, carried as never);
    expect(await contributions.totals(['cc-1'], 2027)).toEqual(new Map());

    listener.onModuleInit();

    expect(await contributions.totals(['cc-1'], 2027)).toEqual(new Map([['cc-1', 123_000_000n]]));
    expect(carried.carriedOverOf).toHaveBeenCalledWith(['cc-1'], 2027, undefined);
  });

  it('QĐ-111ac: declares the extension point it binds', () => {
    expect(CarriedOverListener.binds).toEqual([CarriedOverContributions]);
  });
});
