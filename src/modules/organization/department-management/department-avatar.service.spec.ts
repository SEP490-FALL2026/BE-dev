import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  DepartmentAvatarFileRequiredError,
  DepartmentAvatarInvalidError,
  DepartmentAvatarTooLargeError,
  DepartmentAvatarTypeUnsupportedError,
  DepartmentForbiddenError,
  DepartmentInactiveError,
  DepartmentNotFoundError,
} from '../department/department.errors';
import { DepartmentAvatarService } from './department-avatar.service';

const principal = (role: string): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'emp-actor',
  directRoles: [role],
  roles: [role],
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

/** The picture of a department (`QĐ-113c`): who may, what is refused, and the order object, row, old object. */
describe('DepartmentAvatarService', () => {
  const tx = { name: 'tx' };
  const calls: string[] = [];
  const repo = { findById: jest.fn(), lock: jest.fn(), setAvatar: jest.fn(), clearAvatar: jest.fn() };
  const storage = { putObject: jest.fn<Promise<void>, [{ key: string; contentType: string }]>(), delete: jest.fn() };
  const audit = { record: jest.fn() };
  const context = { findOrganization: jest.fn() };
  const runner = {
    run: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) => {
      const result = await work(tx);
      calls.push('commit');

      return result;
    }),
  };
  const superAdmin = principal('SUPER_ADMIN');
  const now = new Date('2026-11-18T10:00:00.000Z');
  const png = { bytes: PNG, declaredContentType: 'image/png' };

  const service = () =>
    new DepartmentAvatarService(repo as never, context as never, storage as never, audit as never, runner as never);

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    context.findOrganization.mockResolvedValue({ id: 'org-1' });
    repo.findById.mockResolvedValue({ id: 'dep-1', status: 'ACTIVE' });
    repo.lock.mockResolvedValue({ id: 'dep-1', status: 'ACTIVE', avatarObjectKey: null, avatarContentType: null });
    storage.putObject.mockImplementation(() => {
      calls.push('put');

      return Promise.resolve();
    });
    storage.delete.mockImplementation(() => {
      calls.push('delete');

      return Promise.resolve();
    });
  });

  it.each([['IT_ADMIN'], ['FINANCE'], ['MANAGER'], ['EMPLOYEE']])(
    'refuses %s before it touches the storage',
    async (role) => {
      await expect(service().upload(principal(role), 'dep-1', png, now)).rejects.toBeInstanceOf(
        DepartmentForbiddenError,
      );
      await expect(service().remove(principal(role), 'dep-1')).rejects.toBeInstanceOf(DepartmentForbiddenError);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(runner.run).not.toHaveBeenCalled();
    },
  );

  describe('upload', () => {
    it('refuses a missing or retired department before writing anything to the storage', async () => {
      repo.findById.mockResolvedValueOnce(null);
      await expect(service().upload(superAdmin, 'dep-1', png, now)).rejects.toBeInstanceOf(DepartmentNotFoundError);
      repo.findById.mockResolvedValueOnce({ id: 'dep-1', status: 'INACTIVE' });
      await expect(service().upload(superAdmin, 'dep-1', png, now)).rejects.toBeInstanceOf(DepartmentInactiveError);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('needs a file, and judges it by its signature before anything is written', async () => {
      await expect(service().upload(superAdmin, 'dep-1', undefined, now)).rejects.toBeInstanceOf(
        DepartmentAvatarFileRequiredError,
      );
      await expect(
        service().upload(superAdmin, 'dep-1', { bytes: GIF, declaredContentType: 'image/gif' }, now),
      ).rejects.toBeInstanceOf(DepartmentAvatarTypeUnsupportedError);
      await expect(
        service().upload(
          superAdmin,
          'dep-1',
          { bytes: Buffer.alloc(1024 * 1024 + 1, 1), declaredContentType: 'image/png' },
          now,
        ),
      ).rejects.toBeInstanceOf(DepartmentAvatarTooLargeError);
      await expect(
        service().upload(superAdmin, 'dep-1', { bytes: PNG, declaredContentType: 'image/jpeg' }, now),
      ).rejects.toMatchObject({ reason: 'TYPE_MISMATCH' });
      await expect(
        service().upload(superAdmin, 'dep-1', { bytes: Buffer.alloc(0), declaredContentType: 'image/png' }, now),
      ).rejects.toBeInstanceOf(DepartmentAvatarInvalidError);
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('answers not found for no department, refuses a retired one, and takes the new object back', async () => {
      repo.lock.mockResolvedValueOnce(null);
      await expect(service().upload(superAdmin, 'dep-1', png, now)).rejects.toBeInstanceOf(DepartmentNotFoundError);
      repo.lock.mockResolvedValueOnce({ id: 'dep-1', status: 'INACTIVE', avatarObjectKey: null });
      await expect(service().upload(superAdmin, 'dep-1', png, now)).rejects.toBeInstanceOf(DepartmentInactiveError);
      expect(storage.delete).toHaveBeenCalledTimes(2);
    });

    it('writes the object first, points the department at it with its audit, then deletes the old object after the commit', async () => {
      repo.lock.mockResolvedValue({
        id: 'dep-1',
        status: 'ACTIVE',
        avatarObjectKey: 'department-avatars/org-1/dep-1/old.png',
        avatarContentType: 'image/png',
      });

      await service().upload(superAdmin, 'dep-1', png, now);

      const put = storage.putObject.mock.calls[0]?.[0];
      expect(put.key).toMatch(/^department-avatars\/org-1\/dep-1\/[0-9a-f-]+\.png$/);
      expect(put.contentType).toBe('image/png');
      expect(repo.setAvatar).toHaveBeenCalledWith(tx, 'dep-1', { key: put.key, contentType: 'image/png', at: now });
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.AVATAR_CHANGED',
          resourceType: 'Department',
          resourceId: 'dep-1',
          before: { hadAvatar: true },
          after: { contentType: 'image/png', bytes: PNG.length },
        }),
      );
      expect(calls).toEqual(['put', 'commit', 'delete']);
      expect(storage.delete).toHaveBeenCalledWith('department-avatars/org-1/dep-1/old.png');
    });

    it('takes the new object back when the transaction fails, and keeps the old one', async () => {
      audit.record.mockRejectedValueOnce(new Error('boom'));

      await expect(service().upload(superAdmin, 'dep-1', png, now)).rejects.toThrow('boom');
      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith(storage.putObject.mock.calls[0]?.[0].key);
    });

    it('still succeeds when the old object cannot be deleted: it only logs', async () => {
      repo.lock.mockResolvedValue({
        id: 'dep-1',
        status: 'ACTIVE',
        avatarObjectKey: 'k-old',
        avatarContentType: 'image/png',
      });
      storage.delete.mockRejectedValueOnce(new Error('storage down'));

      await expect(service().upload(superAdmin, 'dep-1', png, now)).resolves.toBeUndefined();
    });
  });

  describe('remove', () => {
    it('clears the row, audits, and deletes the object after the commit', async () => {
      repo.lock.mockResolvedValue({
        id: 'dep-1',
        status: 'ACTIVE',
        avatarObjectKey: 'k-old',
        avatarContentType: 'image/png',
      });

      await service().remove(superAdmin, 'dep-1');

      expect(repo.clearAvatar).toHaveBeenCalledWith(tx, 'dep-1', expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.AVATAR_REMOVED',
          before: { hadAvatar: true },
          after: { hadAvatar: false },
        }),
      );
      expect(calls).toEqual(['commit', 'delete']);
      expect(storage.delete).toHaveBeenCalledWith('k-old');
    });

    it('changes nothing and records nothing for a department with no picture', async () => {
      await service().remove(superAdmin, 'dep-1');

      expect(repo.clearAvatar).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('answers not found, and refuses a retired department', async () => {
      repo.lock.mockResolvedValueOnce(null);
      await expect(service().remove(superAdmin, 'dep-1')).rejects.toBeInstanceOf(DepartmentNotFoundError);
      repo.lock.mockResolvedValueOnce({ id: 'dep-1', status: 'INACTIVE', avatarObjectKey: 'k' });
      await expect(service().remove(superAdmin, 'dep-1')).rejects.toBeInstanceOf(DepartmentInactiveError);
    });
  });
});
