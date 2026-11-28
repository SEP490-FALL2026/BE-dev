import { orderByTicketPosition, processingOrder, restoreBodyOrder } from './request-ticket-order.policy';

describe('request-ticket-order.policy (§7.7)', () => {
  const cases = [
    {
      name: '[R3(PH1#3), X, R1(PH1#1)] -> [R1, X, R3]',
      items: [
        { requestId: 'R3', ticket: { id: 'PH1', position: 3 } },
        { requestId: 'X', ticket: null },
        { requestId: 'R1', ticket: { id: 'PH1', position: 1 } },
      ],
      expectedOrder: ['R1', 'X', 'R3'],
    },
    {
      name: '[A(PH1#2), B(PH2#1), C(PH1#1)] -> [C, B, A]',
      items: [
        { requestId: 'A', ticket: { id: 'PH1', position: 2 } },
        { requestId: 'B', ticket: { id: 'PH2', position: 1 } },
        { requestId: 'C', ticket: { id: 'PH1', position: 1 } },
      ],
      expectedOrder: ['C', 'B', 'A'],
    },
    {
      name: 'without tickets keeps body order',
      items: [
        { requestId: 'X1', ticket: null },
        { requestId: 'X2', ticket: null },
        { requestId: 'X3', ticket: null },
      ],
      expectedOrder: ['X1', 'X2', 'X3'],
    },
  ];

  describe('orderByTicketPosition', () => {
    it.each(cases)('orders $name', ({ items, expectedOrder }) => {
      expect(orderByTicketPosition(items).map((item) => item.requestId)).toEqual(expectedOrder);
    });
  });

  describe('processingOrder', () => {
    it.each(cases)('orders $name', ({ items, expectedOrder }) => {
      expect(processingOrder(items)).toEqual(expectedOrder);
    });
  });

  describe('restoreBodyOrder', () => {
    it.each(cases)('restores original body order for $name', ({ items, expectedOrder }) => {
      const bodyIds = items.map((item) => item.requestId);
      const processedRows = expectedOrder.map((requestId, index) => ({ requestId, processedAt: index }));

      expect(restoreBodyOrder(bodyIds, processedRows)).toEqual(
        bodyIds.map((requestId) => ({ requestId, processedAt: expectedOrder.indexOf(requestId) })),
      );
    });
  });
});
