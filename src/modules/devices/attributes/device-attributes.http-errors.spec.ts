import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceNotEditableError,
  DeviceSerialNumberTakenError,
  DeviceStaleError,
  DeviceUpdateEmptyError,
} from './device-attributes.errors';
import { DEVICE_ATTRIBUTES_ERROR_EXAMPLES, toDeviceAttributesApiException } from './device-attributes.http-errors';

const answer = (error: Error) => {
  const mapped = toDeviceAttributesApiException(error) as ApiException;
  const body = mapped.getResponse() as { code: string; details?: Record<string, unknown> };

  return { status: mapped.getStatus(), code: body.code, details: body.details };
};

describe('the answers of the correction of a machine (the codes of the SPEC)', () => {
  it('answers 409 DEVICE.ALREADY_RETIRED for a machine taken out of use and 409 DEVICE.VOIDED for a voided record', () => {
    expect(answer(new DeviceNotEditableError('RETIRED'))).toMatchObject({
      status: 409,
      code: 'DEVICE.ALREADY_RETIRED',
    });
    expect(answer(new DeviceNotEditableError('VOIDED'))).toMatchObject({ status: 409, code: 'DEVICE.VOIDED' });
  });

  it('answers 409 DEVICE.SERIAL_TAKEN when another machine has the serial number', () => {
    expect(answer(new DeviceSerialNumberTakenError())).toMatchObject({ status: 409, code: 'DEVICE.SERIAL_TAKEN' });
  });

  it('answers 409 DEVICE.STALE with the current version, 422 DEVICE.UPDATE_EMPTY and 404 DEVICE.NOT_FOUND', () => {
    expect(answer(new DeviceStaleError(new Date('2026-01-01T00:00:00.000Z')))).toEqual({
      status: 409,
      code: 'DEVICE.STALE',
      details: { currentUpdatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(answer(new DeviceUpdateEmptyError())).toMatchObject({ status: 422, code: 'DEVICE.UPDATE_EMPTY' });
    expect(answer(new DeviceNotFoundError())).toMatchObject({ status: 404, code: 'DEVICE.NOT_FOUND' });
  });

  it('answers 403 DEVICE.NOT_IN_CHARGE when the caller is not the IT Admin who answers for the machine (F3)', () => {
    expect(answer(new DeviceNotInChargeError())).toMatchObject({ status: 403, code: 'DEVICE.NOT_IN_CHARGE' });
  });

  it('shows an example for each of its answers, under the code the SPEC names and no other', () => {
    expect(Object.keys(DEVICE_ATTRIBUTES_ERROR_EXAMPLES).sort()).toEqual(
      ['ALREADY_RETIRED', 'NOT_FOUND', 'NOT_IN_CHARGE', 'SERIAL_TAKEN', 'STALE', 'UPDATE_EMPTY', 'VOIDED'].sort(),
    );
  });
});
