import type { DemoFixture } from '../demo-fixture.types';

export const EXTRAS: Pick<DemoFixture, 'draft' | 'saasIssue' | 'notice'> = {
  draft: { requester: 'DS1-DEV3', plan: 'jira-standard', termMonths: 6 },
  saasIssue: {
    request: 'R1',
    description: '[DS1-ISSUE] Không mở được bảng của dự án sau khi được thêm vào workspace.',
  },
  notice: {
    sender: 'DS1-ENGH',
    employee: 'DS1-DEV3',
    kind: 'LONG_LEAVE',
    proposedInDays: 14,
    note: '[DS1-NOTICE] Dự kiến nghỉ dài hạn, chờ căn cứ của phòng Nhân sự.',
  },
};
