import type { SeatTarget } from '../../catalog/public/catalog.types';
import type { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import type { HeldSoftware } from '../../licensing/public/licensing.types';
import type { DeviceActivationDeviceSummary, HeldDeviceSummary } from '../registry/registry-query.repo';

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

/** Formats the result of opening or moving a device activation for HTTP 201 responses. */
export function toOpenedDeviceActivationDto(opened: OpenedActivation) {
  return {
    activation: toDeviceActivationDto(opened.activation),
    activationsUsed: opened.activationsUsed,
    maxActivations: opened.maxActivations,
    overActivationCap: opened.overActivationCap,
  };
}

/** Formats one enriched machine activation item for `GET /device-activations`. */
export function toDeviceActivationListItemDto(
  record: ActivationRecord,
  device: DeviceActivationDeviceSummary,
  plan: SeatTarget,
) {
  return {
    id: record.id,
    device: {
      id: device.id,
      assetCode: device.assetCode,
      custody: device.custody,
      condition: device.condition,
    },
    plan: {
      id: plan.planId,
      name: plan.planName,
      keyBinding: plan.keyBinding as 'DEVICE_KEY' | 'DEVICE_BUNDLED',
    },
    application: {
      id: plan.applicationId,
      name: plan.applicationName,
    },
    licenseKey:
      record.licenseKeyId && record.keyMasked !== null
        ? { id: record.licenseKeyId, masked: record.keyMasked, withdrawn: record.keyWithdrawn }
        : null,
    lotId: record.subscriptionId,
    origin: record.origin,
    activatedOn: record.activatedOn,
    deactivatedOn: record.deactivatedOn,
    endCause: record.endCause,
    licenseReleased: record.licenseReleased,
    overActivationCap: record.overActivationCap,
    needsKeyReplacement: record.deactivatedAt === null && record.keyWithdrawn,
  };
}

/** Formats one personal account-bound software item for `GET /devices/:id/holder-software`. */
export function toDeviceHolderSoftwareItemDto(item: HeldSoftware) {
  return {
    assignmentId: item.assignmentId,
    applicationName: item.applicationName,
    planName: item.planName,
    grantedOn: item.grantedOn,
    endsOn: item.endsOn,
  };
}

/** Formats one open machine-bound software activation for `GET /me/device-software`. */
export function toMeDeviceSoftwareItemDto(record: ActivationRecord, device: HeldDeviceSummary, plan: SeatTarget) {
  return {
    activationId: record.id,
    device: {
      id: device.id,
      assetCode: device.assetCode,
      hostname: device.hostname,
    },
    plan: {
      id: plan.planId,
      name: plan.planName,
      keyBinding: plan.keyBinding as 'DEVICE_KEY' | 'DEVICE_BUNDLED',
    },
    application: {
      id: plan.applicationId,
      name: plan.applicationName,
    },
    activatedOn: record.activatedOn,
  };
}
