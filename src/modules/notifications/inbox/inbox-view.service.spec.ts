import { Logger } from '@nestjs/common';
import type { InAppNotificationRecord } from '../public/notifications.types';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../public/notifications.extension-points';
import { InboxViewService } from './inbox-view.service';

const REQUEST_A = '11111111-1111-4111-8111-111111111111';
const REQUEST_B = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const DEPARTMENT = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-17T01:00:00.000Z');

const record = (overrides: Partial<InAppNotificationRecord> = {}): InAppNotificationRecord => ({
  id: '55555555-5555-4555-8555-555555555555',
  code: 'REQUEST_NEED_APPROVED',
  subjectType: 'ACCESS_REQUEST',
  subjectId: REQUEST_A,
  params: { requestId: REQUEST_A, next: 'SPEND_SUBMISSION' },
  createdAt: NOW,
  readAt: null,
  ...overrides,
});

type Names = jest.MockedFunction<NotificationNameSource['names']>;

/** A source that knows the given names of the kinds it serves; `spy` is the mock behind `names`, so the calls can be counted. */
function sourceOf(kinds: NameKind[], known: Record<string, string>): NotificationNameSource & { spy: Names } {
  const spy: Names = jest.fn((_kind, ids) =>
    Promise.resolve(new Map(ids.filter((id) => id in known).map((id) => [id, known[id]]))),
  );

  return { kinds, names: spy, spy };
}

function serviceWith(...sources: NotificationNameSource[]): InboxViewService {
  const contributions = new NotificationNameContributions();
  sources.forEach((source, index) => contributions.add(`test.source-${index}`, source));

  return new InboxViewService(contributions);
}

describe('InboxViewService', () => {
  let warn: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('asks nothing for an empty page', async () => {
    const source = sourceOf(['REQUEST'], {});

    await expect(serviceWith(source).view([], 'vi')).resolves.toEqual([]);

    expect(source.spy).not.toHaveBeenCalled();
  });

  it('puts the real name of the entity in the sentence, in the language asked, with the target and the title', async () => {
    const source = sourceOf(['REQUEST'], { [REQUEST_A]: 'Figma – Professional' });
    const service = serviceWith(source);

    const [vi] = await service.view([record()], 'vi');
    const [en] = await service.view([record()], 'en');

    expect(vi.title).toBe('Nhu cầu đã được duyệt');
    expect(vi.message).toContain('Figma – Professional');
    expect(en.title).toBe('Need approved');
    expect(en.message).toContain('Figma – Professional');
    expect(vi.target).toEqual({ operationId: 'accessRequestGet', pathParams: { id: REQUEST_A } });
    expect(vi.record).toEqual(record());
  });

  it('asks each kind once for the unique ids of the whole page, however many notices name them', async () => {
    const requests = sourceOf(['REQUEST'], { [REQUEST_A]: 'Figma – Pro', [REQUEST_B]: 'Miro – Team' });
    const people = sourceOf(['EMPLOYEE', 'DEPARTMENT'], { [EMPLOYEE]: 'An Nguyen', [DEPARTMENT]: 'Phong Ke toan' });
    const created = record({
      code: 'EMPLOYEE_PROFILE_CREATED',
      subjectType: 'EMPLOYEE',
      subjectId: EMPLOYEE,
      params: { employeeId: EMPLOYEE, departmentId: DEPARTMENT },
    });

    const views = await serviceWith(requests, people).view(
      [
        record(),
        record({ id: 'a', params: { requestId: REQUEST_A, next: 'SPEND_SUBMISSION' } }),
        record({ id: 'b', subjectId: REQUEST_B, params: { requestId: REQUEST_B, next: 'SPEND_SUBMISSION' } }),
        created,
        { ...created, id: 'c' },
      ],
      'vi',
    );

    expect(requests.spy).toHaveBeenCalledTimes(1);
    expect(requests.spy).toHaveBeenCalledWith('REQUEST', [REQUEST_A, REQUEST_B]);
    expect(people.spy).toHaveBeenCalledTimes(2);
    expect(people.spy).toHaveBeenCalledWith('EMPLOYEE', [EMPLOYEE]);
    expect(people.spy).toHaveBeenCalledWith('DEPARTMENT', [DEPARTMENT]);
    expect(views[2].message).toContain('Miro – Team');
    expect(views[3].message).toContain('An Nguyen');
    expect(views[3].message).toContain('Phong Ke toan');
  });

  it('asks no kind that the sentence of the language does not print', async () => {
    const source = sourceOf(['REQUEST', 'EMPLOYEE'], { [REQUEST_A]: 'Figma – Pro' });
    const withUnusedName = record({ params: { requestId: REQUEST_A, next: 'SPEND_SUBMISSION', employeeId: EMPLOYEE } });

    await serviceWith(source).view([withUnusedName], 'vi');

    expect(source.spy.mock.calls.map(([kind]) => kind)).toEqual(['REQUEST']);
  });

  it('merges several sources of one kind and keeps the name the first one gave', async () => {
    const first = sourceOf(['REQUEST'], { [REQUEST_A]: 'From first' });
    const second = sourceOf(['REQUEST'], { [REQUEST_A]: 'From second', [REQUEST_B]: 'Only second' });

    const views = await serviceWith(first, second).view(
      [record(), record({ id: 'b', params: { requestId: REQUEST_B, next: 'SPEND_SUBMISSION' } })],
      'vi',
    );

    expect(views[0].message).toContain('From first');
    expect(views[0].message).not.toContain('From second');
    expect(views[1].message).toContain('Only second');
  });

  it('uses the generic phrase for an id nobody knows, and logs nothing', async () => {
    const [view] = await serviceWith(sourceOf(['REQUEST'], {})).view([record()], 'vi');

    expect(view.message).toContain('(không rõ tên)');
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the generic phrase and logs one line, without any id or name, when a source fails', async () => {
    const failing = sourceOf(['REQUEST'], {});
    failing.spy.mockRejectedValue(new Error(`boom for ${REQUEST_A} Figma`));

    const [view] = await serviceWith(failing).view([record()], 'en');

    expect(view.message).toContain('(unnamed)');
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0];
    expect(line).toContain('REQUEST');
    expect(line).not.toContain(REQUEST_A);
    expect(line).not.toContain('Figma');
  });

  it('keeps the names of the other kinds when one source fails', async () => {
    const failing = sourceOf(['EMPLOYEE'], {});
    failing.spy.mockRejectedValue(new Error('down'));
    const working = sourceOf(['DEPARTMENT'], { [DEPARTMENT]: 'Phong Ke toan' });
    const created = record({
      code: 'EMPLOYEE_PROFILE_CREATED',
      subjectType: 'EMPLOYEE',
      subjectId: EMPLOYEE,
      params: { employeeId: EMPLOYEE, departmentId: DEPARTMENT },
    });

    const [view] = await serviceWith(failing, working).view([created], 'vi');

    expect(view.message).toContain('một nhân viên');
    expect(view.message).toContain('Phong Ke toan');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('uses the generic phrase and logs one line for a kind nobody registered', async () => {
    const [view] = await serviceWith().view([record()], 'vi');

    expect(view.message).toContain('(không rõ tên)');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('REQUEST');
  });

  it('writes the old spelling of a subject type in UPPER_SNAKE', async () => {
    const [view] = await serviceWith().view(
      [record({ code: 'LICENSE_EXPIRY_REMINDER', subjectType: 'LicenseAssignment', subjectId: REQUEST_B, params: {} })],
      'vi',
    );

    expect(view.record.subjectType).toBe('LICENSE_ASSIGNMENT');
    expect(view.record.subjectId).toBe(REQUEST_B);
  });

  it('gives a notice with no subject a null target and keeps its subject empty', async () => {
    const [view] = await serviceWith().view(
      [record({ code: 'EMPLOYEE_PROFILE_UPDATED', subjectType: null, subjectId: null, params: {} })],
      'vi',
    );

    expect(view.record.subjectType).toBeNull();
    expect(view.target).toBeNull();
  });

  it('answers a code that left the table with a generic title, no message and the target of its subject, without throwing', async () => {
    const [vi] = await serviceWith().view([record({ code: 'GONE_CODE' })], 'vi');
    const [en] = await serviceWith().view([record({ code: 'GONE_CODE' })], 'en');

    expect(vi).toMatchObject({ title: 'Thông báo mới', message: '' });
    expect(en).toMatchObject({ title: 'New notification', message: '' });
    expect(vi.target).toEqual({ operationId: 'accessRequestGet', pathParams: { id: REQUEST_A } });
    expect(warn).not.toHaveBeenCalled();
  });
});
