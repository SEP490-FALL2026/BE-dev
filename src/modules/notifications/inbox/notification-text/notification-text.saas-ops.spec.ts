import { nameLookupKey, nameRefsOf, renderNotificationText } from './inbox-notification-text.policy';

/**
 * The sentences and labels of the notices of the operations round (A2) that follow the spend batch: a report of an error in a SaaS right,
 * a case outside the process, the differences with a vendor and the request to stop collecting a machine. Every value of an enum that a
 * sentence prints is checked by itself, because the table spec only fails when a whole table of labels is missing.
 */

const UUID = '00000000-0000-0000-0000-000000000000';
const APP = '11111111-1111-4111-8111-111111111111';
const PERSON = '22222222-2222-4222-8222-222222222222';
const names = new Map([
  [nameLookupKey('APPLICATION', APP), 'Figma'],
  [nameLookupKey('EMPLOYEE', PERSON), 'Lan'],
]);
const render = (code: string, params: Record<string, unknown>, locale: 'vi' | 'en') =>
  renderNotificationText(code, params, locale, names);

describe('a report of an error in a SaaS right', () => {
  const submitted = { issueId: UUID, issueCode: 'ISS-7', category: 'NO_ACCESS', impact: 'PARTIAL', applicationId: APP };

  it('tells the IT Admin of a new report, with its kind and effect in words', () => {
    expect(render('SAAS_ISSUE_SUBMITTED', submitted, 'vi')).toEqual({
      title: 'Có phiếu báo lỗi mới',
      message:
        'Phiếu ISS-7 về ứng dụng Figma (không vào được phần mềm, ảnh hưởng dùng được một phần) vừa được gửi và giao cho bạn.',
    });
    expect(render('SAAS_ISSUE_SUBMITTED', submitted, 'en').message).toBe(
      'Issue report ISS-7 for Figma (no access to the software, impact the software works in part) was sent and assigned to you.',
    );
  });

  it.each([
    ['NO_ACCESS', 'không vào được phần mềm', 'no access to the software'],
    [
      'INVITATION_OR_ACTIVATION',
      'lời mời hoặc kích hoạt tài khoản không dùng được',
      'invitation or account activation failed',
    ],
    ['MISSING_PLAN_FEATURE', 'thiếu tính năng của gói', 'a feature of the plan is missing'],
    ['PROVIDER_OUTAGE', 'nhà cung cấp có vẻ đang lỗi', 'the vendor seems to be down'],
    ['OTHER', 'lỗi khác', 'other error'],
  ])('words the category %s', (category, vi, en) => {
    expect(render('SAAS_ISSUE_SUBMITTED', { ...submitted, category }, 'vi').message).toContain(`(${vi},`);
    expect(render('SAAS_ISSUE_SUBMITTED', { ...submitted, category }, 'en').message).toContain(`(${en},`);
  });

  it.each([
    ['UNUSABLE', 'không dùng được phần mềm', 'the software cannot be used'],
    ['PARTIAL', 'dùng được một phần', 'the software works in part'],
    ['QUESTION_OR_OTHER', 'câu hỏi hoặc ảnh hưởng khác', 'a question or another effect'],
  ])('words the impact %s', (impact, vi, en) => {
    expect(render('SAAS_ISSUE_SUBMITTED', { ...submitted, impact }, 'vi').message).toContain(`ảnh hưởng ${vi})`);
    expect(render('SAAS_ISSUE_SUBMITTED', { ...submitted, impact }, 'en').message).toContain(`impact ${en})`);
  });

  it('tells of the due day of the first response', () => {
    const params = { issueId: UUID, issueCode: 'ISS-7', responseDueOn: '2026-11-20' };
    expect(render('SAAS_ISSUE_RESPONSE_OVERDUE', params, 'vi').message).toBe(
      'Phiếu ISS-7 chưa có phản hồi đầu tiên và đã quá hạn 20/11/2026.',
    );
    expect(render('SAAS_ISSUE_RESPONSE_OVERDUE', params, 'en').message).toBe(
      'Issue report ISS-7 has no first response and passed its due date 20 Nov 2026.',
    );
  });

  it.each([
    ['NEW', 'mới gửi', 'new'],
    ['IN_PROGRESS', 'đang xử lý', 'in progress'],
    ['WAITING_REPORTER', 'chờ người báo trả lời', 'waiting for the reporter'],
    ['WAITING_PROVIDER', 'chờ nhà cung cấp', 'waiting for the vendor'],
    ['RESOLVED', 'đã giải quyết', 'resolved'],
    ['CLOSED', 'đã đóng', 'closed'],
    ['DUPLICATE', 'trùng phiếu khác', 'duplicate'],
  ])('words the state %s, both as the one a report leaves and as the one it reaches', (state, vi, en) => {
    const params = { issueId: UUID, issueCode: 'ISS-7', trigger: 'IT_ACTION' };
    expect(render('SAAS_ISSUE_STATE_CHANGED', { ...params, fromState: state, toState: 'NEW' }, 'vi').message).toBe(
      `Phiếu ISS-7 chuyển từ ${vi} sang mới gửi.`,
    );
    expect(render('SAAS_ISSUE_STATE_CHANGED', { ...params, fromState: 'NEW', toState: state }, 'en').message).toBe(
      `Issue report ISS-7 moved from new to ${en}.`,
    );
  });

  it.each([
    ['REPORTER_REPLY', 'Người báo vừa trả lời.', 'The reporter replied.'],
    ['REPORTER_REOPEN', 'Người báo đã mở lại phiếu.', 'The reporter reopened it.'],
    ['REOPEN_WINDOW_LAPSED', 'Phiếu tự đóng vì hết thời gian mở lại.', 'It closed because the reopen window ended.'],
  ])('adds what the trigger %s says to the sentence', (trigger, vi, en) => {
    const params = { issueId: UUID, issueCode: 'ISS-7', fromState: 'RESOLVED', toState: 'CLOSED', trigger };
    expect(render('SAAS_ISSUE_STATE_CHANGED', params, 'vi').message).toBe(
      `Phiếu ISS-7 chuyển từ đã giải quyết sang đã đóng. ${vi}`,
    );
    expect(render('SAAS_ISSUE_STATE_CHANGED', params, 'en').message).toBe(
      `Issue report ISS-7 moved from resolved to closed. ${en}`,
    );
  });

  it('says nothing more when an IT Admin moved the report, and for a trigger it does not know or none', () => {
    for (const trigger of ['IT_ACTION', 'NO_SUCH_TRIGGER', null]) {
      const params = { issueId: UUID, issueCode: 'ISS-7', fromState: 'NEW', toState: 'IN_PROGRESS', trigger };
      expect(render('SAAS_ISSUE_STATE_CHANGED', params, 'vi').message).toBe(
        'Phiếu ISS-7 chuyển từ mới gửi sang đang xử lý.',
      );
      expect(render('SAAS_ISSUE_STATE_CHANGED', params, 'en').message).toBe(
        'Issue report ISS-7 moved from new to in progress.',
      );
    }
  });
});

describe('a case outside the process, a vendor account difference and a request to stop collecting', () => {
  const caseParams = { caseId: UUID, applicationId: APP, vendorId: UUID, employeeId: PERSON };

  it('names the person and the software of a case closed as a report only, and the software alone when there is none', () => {
    expect(render('OUT_OF_PROCESS_CASE_REPORTED', caseParams, 'vi').message).toBe(
      'Đã ghi nhận Lan dùng phần mềm Figma ngoài quy trình. Công ty không có tài khoản để thu hồi nên hồ sơ chỉ được ghi nhận và báo cáo.',
    );
    expect(render('OUT_OF_PROCESS_CASE_REPORTED', { ...caseParams, applicationId: null }, 'en').message).toBe(
      'Lan was recorded using software outside the process. The company holds no account to revoke, so the case is recorded and reported only.',
    );
  });

  it.each([
    ['USAGE_IMPORT', 'báo cáo sử dụng của nhà cung cấp', 'vendor usage report'],
    ['INVOICE_DIFFERENCE', 'chênh lệch hóa đơn', 'invoice difference'],
    ['COLLECTOR_UNLISTED', 'công cụ lạ do collector báo', 'unlisted tool reported by the collector'],
  ])('counts the new differences and says the kind of batch %s that opened them', (source, vi, en) => {
    const params = { applicationId: null, vendorId: null, source, newCount: 3 };
    expect(render('VENDOR_ACCOUNT_DISCREPANCY_OPENED', params, 'vi').message).toBe(
      `Có 3 sai lệch tài khoản nhà cung cấp mới cần xử lý (nguồn: ${vi}).`,
    );
    expect(render('VENDOR_ACCOUNT_DISCREPANCY_OPENED', params, 'en').message).toBe(
      `3 new vendor account discrepancies need handling (source: ${en}).`,
    );
  });

  const stop = {
    stopRequestId: UUID,
    registrationId: UUID,
    deviceId: UUID,
    holderEmployeeId: PERSON,
    dueAt: '2026-11-20T10:00:00.000Z',
    dueOn: '2026-11-20',
  };

  it('names the holder and the day to handle a request to stop collecting, and the day it passed', () => {
    expect(render('DEVICE_STOP_REQUESTED', stop, 'vi').message).toBe(
      'Lan yêu cầu dừng thu thập dữ liệu trên một máy. Vui lòng xử lý trước 20/11/2026.',
    );
    expect(render('DEVICE_STOP_REQUESTED', stop, 'en').message).toBe(
      'Lan asked to stop data collection on a device. Please handle it by 20 Nov 2026.',
    );
    expect(render('DEVICE_STOP_REQUEST_OVERDUE', stop, 'vi').message).toBe(
      'Yêu cầu dừng thu thập của Lan đã quá hạn 20/11/2026 mà chưa được xử lý.',
    );
    expect(render('DEVICE_STOP_REQUEST_OVERDUE', stop, 'en').message).toBe(
      'The collection stop request of Lan passed its due date 20 Nov 2026 without being handled.',
    );
  });

  it('lists the one name each of these sentences prints', () => {
    expect(nameRefsOf('DEVICE_STOP_REQUESTED', stop, 'vi')).toEqual([{ kind: 'EMPLOYEE', id: PERSON }]);
    expect(nameRefsOf('OUT_OF_PROCESS_CASE_REPORTED', { ...caseParams, applicationId: null }, 'vi')).toEqual([
      { kind: 'EMPLOYEE', id: PERSON },
    ]);
  });
});
