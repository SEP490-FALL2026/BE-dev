import { EmailDispatcher } from '../email/email-dispatcher.service';
import { EmailDeliveryApi } from './email-delivery.api';

describe('EmailDeliveryApi', () => {
  it('hands the due batch and the link check to the private dispatcher and returns its count', async () => {
    const dispatchDue = jest.fn().mockResolvedValue(3);
    const delivery = new EmailDeliveryApi({ dispatchDue } as unknown as EmailDispatcher);
    const isUsable = jest.fn().mockResolvedValue(true);

    await expect(delivery.dispatchDue(isUsable)).resolves.toBe(3);
    expect(dispatchDue).toHaveBeenCalledTimes(1);
    expect(dispatchDue).toHaveBeenCalledWith(isUsable);
  });

  it('lets a failed batch reach the caller, which logs it', async () => {
    const failure = new TypeError('boom');
    const delivery = new EmailDeliveryApi({
      dispatchDue: jest.fn().mockRejectedValue(failure),
    } as unknown as EmailDispatcher);

    await expect(delivery.dispatchDue(jest.fn())).rejects.toBe(failure);
  });
});
