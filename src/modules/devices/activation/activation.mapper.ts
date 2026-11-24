import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';

type OpenedActivation = Awaited<ReturnType<LicensingDeviceActivationApi['open']>>;
type ActivationRecord = OpenedActivation['activation'];

/** Formats a licensing activation record for HTTP responses. */
export function toDeviceActivationDto(record: ActivationRecord) {
  return {
    id: record.id,
    deviceId: record.deviceId,
    planId: record.planId,
    licenseKeyId: record.licenseKeyId,
    subscriptionId: record.subscriptionId,
    keyMasked: record.keyMasked,
    keyWithdrawn: record.keyWithdrawn,
    origin: record.origin,
    movedFromActivationId: record.movedFromActivationId,
    activatedOn: record.activatedOn,
    activatedAt: record.activatedAt.toISOString(),
    overActivationCap: record.overActivationCap,
    deactivatedOn: record.deactivatedOn,
    deactivatedAt: record.deactivatedAt ? record.deactivatedAt.toISOString() : null,
    endCause: record.endCause,
    licenseReleased: record.licenseReleased,
  };
}

/** Formats the result of opening a device activation for HTTP 201 responses. */
export function toOpenedDeviceActivationDto(opened: OpenedActivation) {
  return {
    activation: toDeviceActivationDto(opened.activation),
    activationsUsed: opened.activationsUsed,
    maxActivations: opened.maxActivations,
    overActivationCap: opened.overActivationCap,
  };
}
