import type { NoticeRecord } from './notice.repo';

export function toMonitoringNotice(notice: NoticeRecord) {
  return {
    id: notice.id,
    versionNumber: notice.versionNumber,
    collected: notice.collected,
    notCollected: notice.notCollected,
    purpose: notice.purpose,
    retention: notice.retention,
    stopRight: notice.stopRight,
    includesToolStatus: notice.includesToolStatus,
    requiresReacknowledgement: notice.requiresReacknowledgement,
    publishedAt: notice.publishedAt.toISOString(),
  };
}
