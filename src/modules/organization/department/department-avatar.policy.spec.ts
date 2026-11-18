import { departmentAvatarObjectKey } from './department-avatar.policy';

describe('departmentAvatarObjectKey (QĐ-113c)', () => {
  it('names the organization, the department and a token, so a new picture is a new key', () => {
    expect(departmentAvatarObjectKey('org-1', 'dep-1', 'abc123', 'webp')).toBe(
      'department-avatars/org-1/dep-1/abc123.webp',
    );
  });

  it('never falls under the folder of the pictures of people', () => {
    expect(departmentAvatarObjectKey('o', 'd', 't', 'png').startsWith('avatars/')).toBe(false);
  });
});
