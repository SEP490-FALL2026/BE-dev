import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of the notices of the operations round that no older group owns: the batch of spend requests a head sends to the
 * spending approver. Copied from the hand-over table of `SPEC-5A-FIXES.md` (§1.B); one entry per code, `vi` and `en`. A code of the
 * round that has no entry here is not a code of this branch yet.
 */
export const OPS_TEXTS = {
  SPEND_BATCH_SUBMITTED: {
    vi: {
      title: 'Có lô trình duyệt chi mới',
      message: 'Trưởng phòng {departmentId:name} vừa trình một lô có {sentCount} yêu cầu chờ bạn duyệt chi.',
    },
    en: {
      title: 'New spend batch',
      message: 'The head of {departmentId:name} sent a batch with {sentCount} requests awaiting your spend decision.',
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
