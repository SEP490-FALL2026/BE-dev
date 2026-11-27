import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SeatPurchaseNotInChargeError } from '../../catalog/public/seat-ledger.api';
import { SeatPurchasesController } from './seat-purchases.controller';
import type { SeatPurchaseRouteService } from './seat-purchase-route.service';

const actor: AuthenticatedPrincipal = {
  subject: 'u-1',
  appUserId: 'u-1',
  employeeId: 'e-1',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: 's-1',
};

describe('SeatPurchasesController (W3-18)', () => {
  it('delegates to SeatPurchaseRouteService and maps SeatPurchaseNotInChargeError to 403 SEAT_PURCHASE.NOT_IN_CHARGE with details.items', async () => {
    const items = [
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        beneficiaryEmployeeId: '22222222-2222-4222-8222-222222222222',
      },
    ];
    const routeService = {
      purchase: jest.fn().mockRejectedValue(new SeatPurchaseNotInChargeError(items)),
    } as unknown as SeatPurchaseRouteService;
    const controller = new SeatPurchasesController(routeService);

    let caught: unknown;
    try {
      await controller.purchase(
        actor,
        { id: '33333333-3333-4333-8333-333333333333' },
        { purchasedOn: '2026-11-21', items },
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiException);
    expect((caught as ApiException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((caught as ApiException).getResponse()).toEqual(
      expect.objectContaining({
        code: 'SEAT_PURCHASE.NOT_IN_CHARGE',
        details: { items },
      }),
    );
  });
});
