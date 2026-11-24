import { fromDateColumn } from '../../../core/business-date';
import { collectionStateOf } from '../devices-collection-state.policy';
import { custodyOf } from '../devices-custody.policy';
import type { DeviceExtras, DeviceRegistrationRow, DeviceSummaryRow } from './registry-query.repo';
import type { SignatureRecordRow } from './registry.repo';

export interface HolderBrief {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface DepartmentBriefView {
  id: string;
  name: string;
}

export function toDeviceSummary(
  row: DeviceSummaryRow,
  holders: ReadonlyMap<string, HolderBrief>,
  departments: ReadonlyMap<string, DepartmentBriefView>,
) {
  const registration = row.registrationId
    ? {
        collectorInstalled: row.collectorInstalled ?? false,
        acknowledgedFrom: row.acknowledgedFrom,
        collectionStoppedAt: row.collectionStoppedAt,
      }
    : null;

  const state = collectionStateOf({ retiredAt: row.retiredAt, registration });
  const custody = custodyOf({
    voidedAt: row.voidedAt,
    retiredAt: row.retiredAt,
    hasOpenReturnTask: row.hasOpenReturnTask,
    hasOpenRegistration: row.registrationId !== null,
  });

  return {
    id: row.id,
    assetCode: row.assetCode,
    deviceType: row.deviceType,
    serialNumber: row.serialNumber,
    assetCodeOrigin: row.assetCodeOrigin,
    hostname: row.hostname,
    os: row.os,
    condition: row.condition,
    custody,
    retirementKind: row.retirementKind,
    currentDepartment: row.holderEmployeeId ? (departments.get(row.holderEmployeeId) ?? null) : null,
    holder: row.holderEmployeeId ? (holders.get(row.holderEmployeeId) ?? null) : null,
    registrationId: row.registrationId,
    registeredFrom: row.validFrom ? fromDateColumn(row.validFrom) : null,
    state,
    collection: { state, lastAcceptedAt: row.lastAcceptedAt ? row.lastAcceptedAt.toISOString() : null },
    signatureRecorded: row.signatureRecorded,
    signatureMissing: row.registrationId !== null && !row.signatureRecorded,
    retiredAt: row.retiredAt ? row.retiredAt.toISOString() : null,
  };
}

export function toDeviceDetail(
  row: DeviceSummaryRow,
  extras: DeviceExtras,
  holders: ReadonlyMap<string, HolderBrief>,
  departments: ReadonlyMap<string, DepartmentBriefView>,
) {
  const lastHolder = extras.lastEnd ? holders.get(extras.lastEnd.holderEmployeeId) : undefined;

  return {
    ...toDeviceSummary(row, holders, departments),
    acknowledgedFrom: row.acknowledgedFrom ? row.acknowledgedFrom.toISOString() : null,
    latestAcknowledgement: extras.latestAcknowledgement
      ? {
          noticeVersionNumber: extras.latestAcknowledgement.noticeVersionNumber,
          acknowledgedAt: extras.latestAcknowledgement.acknowledgedAt.toISOString(),
        }
      : null,
    latestSignatureRecord: extras.latestSignatureRecord
      ? {
          id: extras.latestSignatureRecord.id,
          documentId: extras.latestSignatureRecord.documentId,
          noticeVersionNumber: extras.latestSignatureRecord.noticeVersionNumber,
          recordedAt: extras.latestSignatureRecord.recordedAt.toISOString(),
        }
      : null,
    lastEnd:
      extras.lastEnd && lastHolder
        ? {
            holder: lastHolder,
            validUntil: extras.lastEnd.validUntil,
            endedAt: extras.lastEnd.endedAt.toISOString(),
            endCause: extras.lastEnd.endCause,
          }
        : null,
    retirementReason: extras.retirementReason,
    conditionNote: extras.conditionNote,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: extras.voidReason,
    updatedAt: row.updatedAt.toISOString(),
    collectorInstalled: row.registrationId ? row.collectorInstalled : null,
    openReturnTask: null,
  };
}

export function toDeviceRegistration(row: DeviceRegistrationRow, holders: ReadonlyMap<string, HolderBrief>) {
  return {
    id: row.id,
    holder: holders.get(row.holderEmployeeId) ?? null,
    validFrom: fromDateColumn(row.validFrom),
    validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    endCause: row.endCause,
    acknowledgedFrom: row.acknowledgedFrom ? row.acknowledgedFrom.toISOString() : null,
    collectionStoppedAt: row.collectionStoppedAt ? row.collectionStoppedAt.toISOString() : null,
    collectorInstalled: row.collectorInstalled,
    signatureRecorded: row.signatureRecorded,
    signatureMissing: row.endedAt === null && !row.signatureRecorded,
    lastAcceptedAt: row.lastAcceptedAt ? row.lastAcceptedAt.toISOString() : null,
  };
}

export function toSignatureRecord(record: SignatureRecordRow) {
  return {
    id: record.id,
    registrationId: record.registrationId,
    documentId: record.documentId,
    noticeVersionNumber: record.noticeVersionNumber,
    recordedAt: record.recordedAt.toISOString(),
  };
}
