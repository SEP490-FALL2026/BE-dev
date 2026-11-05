import type { DemoFixture } from '../demo-fixture.types';

export const EXTRAS: Pick<DemoFixture, 'draft' | 'saasIssue' | 'notice'> = {
  draft: { requester: 'NV-DEV3', plan: 'jira-standard', termMonths: 6 },
  saasIssue: {
    request: 'R1',
    description: '[SV-ISSUE] Không mở được bảng của dự án sau khi được thêm vào workspace.',
  },
  notice: {
    sender: 'NV-ENGH',
    employee: 'NV-DEV3',
    kind: 'LONG_LEAVE',
    proposedInDays: 14,
    note: '[SV-NOTICE] Dự kiến nghỉ dài hạn, chờ căn cứ của phòng Nhân sự.',
  },
};
