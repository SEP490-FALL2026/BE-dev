import type { INestApplicationContext } from '@nestjs/common';
import { RepricingService } from '../../src/modules/requests/repricing/repricing.service';

type Reprice = RepricingService['reprice'];

/**
 * The requests whose amount a suite wrote by hand. Every check of the budget works the amount of a request out again for its day
 * (`QĐ-109e`), which a suite about the check cannot have, since it says what the amount is: for these requests the repricing gives
 * back what the request holds. Any other request is priced by the real rule.
 */
export class FrozenAmounts {
  private readonly ids = new Set<string>();

  freeze(app: INestApplicationContext, requestId: string): void {
    this.ids.add(requestId);
    const repricing = app.get(RepricingService, { strict: false });
    // A suite that restores the mocks takes the spy away: it is put back, never twice.
    if (jest.isMockFunction(Reflect.get(repricing, 'reprice'))) return;
    const original: Reprice = Reflect.get(RepricingService.prototype, 'reprice');
    jest
      .spyOn(repricing, 'reprice')
      .mockImplementation((tx, request, asOf) =>
        this.ids.has(request.id) ? Promise.resolve(request.pricing) : original.call(repricing, tx, request, asOf),
      );
  }

  thaw(): void {
    this.ids.clear();
  }
}
