import { nameLookupKey, renderNotificationText } from './inbox-notification-text.policy';

/**
 * The sentences and labels of the notices of the adjustment of a subscription (SBF-20 v3.1, section 13 of `SPEC-5A-SBF20.md`): the codes
 * the round added, and the ones it changed in params or in meaning. Every value of an enum a sentence prints is checked by itself.
 */

const SUB = '11111111-1111-4111-8111-111111111111';
const RENEWAL = '22222222-2222-4222-8222-222222222222';
const names = new Map([[nameLookupKey('SUBSCRIPTION', SUB), 'Figma Pro']]);
const render = (code: string, params: Record<string, unknown>, locale: 'vi' | 'en') =>
  renderNotificationText(code, params, locale, names);

describe('the point of adjustment of a subscription (SUBSCRIPTION_RENEWAL_ALERT)', () => {
  const point = {
    subscriptionId: SUB,
    renewalId: null,
    baseDate: '2026-12-01',
    renewalOn: '2026-12-08',
    seatsNeeded: 12,
  };

  it.each([
    ['MONTHLY', 'gói tháng', 'monthly'],
    ['ANNUAL', 'gói năm', 'annual'],
  ])('tells the IT Admin the next period of a %s commitment needs the seats', (commitment, vi, en) => {
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', { ...point, commitment }, 'vi')).toEqual({
      title: 'Thuê bao tới điểm điều chỉnh',
      message: `Thuê bao Figma Pro đã tới điểm điều chỉnh của kỳ ${vi}: kỳ sau cần 12 seat, bắt đầu 08/12/2026. Vui lòng làm với nhà cung cấp và ghi kết quả trước 01/12/2026.`,
    });
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', { ...point, commitment }, 'en').message).toBe(
      `Subscription Figma Pro reached the adjustment point of its ${en} period: the next period needs 12 seats from 08 Dec 2026. Please settle it with the vendor and record the outcome before 01 Dec 2026.`,
    );
  });

  it('keeps the old sentence for a notice stored before the commitment existed, with or without its days left', () => {
    const old = {
      subscriptionId: SUB,
      renewalId: null,
      baseDate: '2026-12-01',
      milestoneDays: 7,
      audience: 'IT_ADMIN',
    };
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', old, 'vi').message).toBe(
      'Thuê bao Figma Pro sắp đến hạn 01/12/2026. Còn 7 ngày.',
    );
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', old, 'en').message).toBe(
      'Subscription Figma Pro is due on 01 Dec 2026. 7 days left.',
    );
    const noDays = { subscriptionId: SUB, renewalId: null, baseDate: '2026-12-01', audience: 'IT_ADMIN' };
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', noDays, 'vi').message).toBe(
      'Thuê bao Figma Pro sắp đến hạn 01/12/2026.',
    );
    expect(render('SUBSCRIPTION_RENEWAL_ALERT', { ...old, milestoneDays: 0 }, 'en').message).toBe(
      'Subscription Figma Pro is due on 01 Dec 2026.',
    );
  });
});

describe('the red alert and the seats a monthly plan keeps', () => {
  it('tells of a plan by the year with no outcome near its deadline', () => {
    const params = { subscriptionId: SUB, baseDate: '2026-12-01', renewalOn: '2026-12-08', seatsNeeded: 12 };
    expect(render('SUBSCRIPTION_RENEWAL_RED_ALERT', params, 'vi')).toEqual({
      title: 'Cảnh báo đỏ: thuê bao chưa ghi kết quả điều chỉnh',
      message:
        'Còn ít ngày tới hạn 01/12/2026 mà thuê bao Figma Pro chưa có kết quả điều chỉnh. Kỳ sau cần 12 seat, bắt đầu 08/12/2026.',
    });
    expect(render('SUBSCRIPTION_RENEWAL_RED_ALERT', params, 'en').message).toBe(
      'Subscription Figma Pro has no adjustment outcome and its deadline 01 Dec 2026 is close. The next period needs 12 seats from 08 Dec 2026.',
    );
  });

  it('tells of a monthly plan that kept more seats than it needs', () => {
    const params = { subscriptionId: SUB, renewalOn: '2026-12-08', purchasedQuantity: 20, seatsNeeded: 12 };
    expect(render('SUBSCRIPTION_RENEWAL_KEPT', params, 'vi').message).toBe(
      'Thuê bao Figma Pro không được ghi điều chỉnh trước ngày thanh toán 08/12/2026, nên giữ nguyên 20 seat trong khi chỉ cần 12.',
    );
    expect(render('SUBSCRIPTION_RENEWAL_KEPT', params, 'en').message).toBe(
      'No adjustment was recorded for subscription Figma Pro before its payment day 08 Dec 2026, so it keeps 20 seats while 12 are needed.',
    );
  });
});

describe('the result of an adjustment (SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED)', () => {
  const recorded = {
    renewalId: RENEWAL,
    subscriptionId: SUB,
    choice: 'REDUCE',
    quantity: 8,
    outcome: 'AS_DECIDED',
    nextSubscriptionId: null,
    substitute: false,
  };

  it.each([
    ['RENEW', 'gia hạn đúng số', 'renew as is'],
    ['REDUCE', 'giảm', 'reduce'],
    ['INCREASE', 'tăng', 'increase'],
    ['CANCEL', 'hủy', 'cancel'],
  ])('words the choice %s', (choice, vi, en) => {
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, choice }, 'vi').message).toBe(
      `Kết quả điều chỉnh thuê bao Figma Pro: ${vi} 8 seat, nhà cung cấp đồng ý.`,
    );
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, choice }, 'en').message).toBe(
      `Adjustment of subscription Figma Pro: ${en} 8 seats, vendor agreed.`,
    );
  });

  it.each([
    ['AS_DECIDED', 'đồng ý', 'agreed'],
    ['VENDOR_REFUSED', 'từ chối', 'refused'],
    ['DIFFERENT', 'làm khác', 'did otherwise'],
    ['UNCONFIRMED', 'chưa xác nhận', 'not confirmed'],
  ])('words the outcome %s', (outcome, vi, en) => {
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, outcome }, 'vi').message).toContain(
      `nhà cung cấp ${vi}.`,
    );
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, outcome }, 'en').message).toContain(
      `vendor ${en}.`,
    );
  });

  it('leaves the number of seats out when there is none, as for a cancellation', () => {
    for (const quantity of [null, 0]) {
      const params = { ...recorded, choice: 'CANCEL', quantity };
      expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', params, 'vi').message).toBe(
        'Kết quả điều chỉnh thuê bao Figma Pro: hủy, nhà cung cấp đồng ý.',
      );
    }
  });

  it('tells the IT Admin in charge that another one recorded it for them', () => {
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, substitute: true }, 'vi').message).toBe(
      'Kết quả điều chỉnh thuê bao Figma Pro: giảm 8 seat, nhà cung cấp đồng ý. Một IT Admin khác đã ghi thay.',
    );
    expect(render('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', { ...recorded, substitute: true }, 'en').message).toBe(
      'Adjustment of subscription Figma Pro: reduce 8 seats, vendor agreed. Another IT Admin recorded it on your behalf.',
    );
  });
});

describe('what happens past the renewal day', () => {
  it('tells of an unintended renewal, whether the sweep found it or the outcome did (renewalId null or not)', () => {
    for (const renewalId of [null, RENEWAL]) {
      const params = { subscriptionId: SUB, baseDate: '2026-12-08', renewalId };
      expect(render('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', params, 'vi')).toEqual({
        title: 'Sự cố gia hạn ngoài ý muốn',
        message:
          'Thuê bao Figma Pro có thể đã được nhà cung cấp tự gia hạn vào 08/12/2026 ngoài ý muốn. Vui lòng kiểm tra với nhà cung cấp.',
      });
      expect(render('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', params, 'en')).toEqual({
        title: 'Unintended renewal',
        message:
          'Subscription Figma Pro may have been renewed by the vendor on 08 Dec 2026 unintentionally. Please check with the vendor.',
      });
    }
  });

  it('tells of a subscription that expired with seats still assigned, with or without the end date', () => {
    for (const endDate of ['2026-12-08', null]) {
      const params = { subscriptionId: SUB, baseDate: '2026-12-08', endDate };
      expect(render('SUBSCRIPTION_EXPIRY_MARKED', params, 'vi')).toEqual({
        title: 'Thuê bao hết hạn chưa gia hạn',
        message:
          'Đã qua ngày gia hạn 08/12/2026 mà thuê bao Figma Pro chưa ghi kết quả và vẫn còn quyền đang gán. Quyền có thể bị nhà cung cấp tạm ngưng.',
      });
      expect(render('SUBSCRIPTION_EXPIRY_MARKED', params, 'en').title).toBe('Subscription expired without renewal');
    }
  });
});

describe('the missing contract data of a subscription (SUBSCRIPTION_RENEWAL_DATA_QUALITY)', () => {
  it('says a plan by the year has no deadline to cancel and that the renewal date stands in', () => {
    const params = { subscriptionId: SUB, problem: 'NO_NOTICE_DEADLINE' };
    expect(render('SUBSCRIPTION_RENEWAL_DATA_QUALITY', params, 'vi').message).toBe(
      'Thuê bao Figma Pro thiếu hạn chót báo hủy nên hệ thống nhắc theo ngày gia hạn. Vui lòng bổ sung hạn chót báo hủy trong thông tin hợp đồng.',
    );
    expect(render('SUBSCRIPTION_RENEWAL_DATA_QUALITY', params, 'en').message).toBe(
      'Subscription Figma Pro has no cancellation deadline, so reminders follow its renewal date. Please add the cancellation deadline to the contract details.',
    );
  });

  it('keeps the old sentence for a subscription with no date at all, and for a notice stored without `problem`', () => {
    for (const problem of ['NO_ALERT_ANCHOR', undefined]) {
      expect(render('SUBSCRIPTION_RENEWAL_DATA_QUALITY', { subscriptionId: SUB, problem }, 'vi').message).toBe(
        'Thuê bao Figma Pro chưa có hạn báo hủy hoặc ngày hết hạn nên hệ thống chưa thể nhắc gia hạn. Vui lòng bổ sung thông tin hợp đồng.',
      );
    }
  });
});
