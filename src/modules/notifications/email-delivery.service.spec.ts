import { EmailDispatcher } from './email-dispatcher.service';
import { EmailDeliveryService } from './email-delivery.service';

describe('EmailDeliveryService', () => {
  it('hands the due batch and the link check to the private dispatcher and returns its count', async () => {
    const dispatchDue = jest.fn().mockResolvedValue(3);
    const delivery = new EmailDeliveryService({ dispatchDue } as unknown as EmailDispatcher);
    const isUsable = jest.fn().mockResolvedValue(true);

    await expect(delivery.dispatchDue(isUsable)).resolves.toBe(3);
    expect(dispatchDue).toHaveBeenCalledTimes(1);
    expect(dispatchDue).toHaveBeenCalledWith(isUsable);
  });

  it('lets a failed batch reach the caller, which logs it', async () => {
    const failure = new TypeError('boom');
    const delivery = new EmailDeliveryService({
      dispatchDue: jest.fn().mockRejectedValue(failure),
    } as unknown as EmailDispatcher);

    await expect(delivery.dispatchDue(jest.fn())).rejects.toBe(failure);
  });
});
