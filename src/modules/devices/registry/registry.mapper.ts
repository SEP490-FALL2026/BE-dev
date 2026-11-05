import { fromDateColumn } from '../../../core/business-date';
import { collectionStateOf } from '../devices-collection-state.policy';
import type { DeviceExtras, DeviceSummaryRow } from './registry-query.repo';
import type { SignatureRecordRow } from './registry.repo';

export interface HolderBrief {
  id: string;
  employeeCode: string;
  fullName: string;
}

export function toDeviceSummary(row: DeviceSummaryRow, holders: ReadonlyMap<string, HolderBrief>) {
  const registration = row.registrationId
    ? { acknowledgedFrom: row.acknowledgedFrom, collectionStoppedAt: row.collectionStoppedAt }
    : null;

  return {
    id: row.id,
    assetCode: row.assetCode,
    hostname: row.hostname,
    os: row.os,
    holder: row.holderEmployeeId ? (holders.get(row.holderEmployeeId) ?? null) : null,
    registrationId: row.registrationId,
    registeredFrom: row.validFrom ? fromDateColumn(row.validFrom) : null,
    state: collectionStateOf({ retiredAt: row.retiredAt, registration }),
    signatureRecorded: row.signatureRecorded,
    retiredAt: row.retiredAt ? row.retiredAt.toISOString() : null,
  };
}

export function toDeviceDetail(row: DeviceSummaryRow, extras: DeviceExtras, holders: ReadonlyMap<string, HolderBrief>) {
  const lastHolder = extras.lastEnd ? holders.get(extras.lastEnd.holderEmployeeId) : undefined;

  return {
    ...toDeviceSummary(row, holders),
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
