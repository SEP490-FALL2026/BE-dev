import { Test } from '@nestjs/testing';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { SeedPlan } from '../public/dev-seed.types';
import { DevSeedCredentialsService, LOCAL_PASSWORD_GENERATOR } from './dev-seed-credentials.service';
import { DEMO_PEOPLE } from './dev-seed-fixture.types';

const planWith = (actions: Record<string, string>): SeedPlan =>
  ({
    organizationId: 'org-1',
    items: Object.entries(actions).map(([key, action]) => ({ kind: 'ACCOUNT', key, action })),
  }) as unknown as SeedPlan;

describe('DevSeedCredentialsService', () => {
  const [first, second, third] = DEMO_PEOPLE;
  const identity = {
    prepareCredential: jest.fn((password: string) =>
      Promise.resolve({ hash: `hash(${password})`, hashPolicyVersion: 7 }),
    ),
  };
  let counter = 0;
  const generate = jest.fn(() => `generated-${++counter}`);

  beforeEach(() => {
    counter = 0;
    jest.clearAllMocks();
  });

  async function build(): Promise<DevSeedCredentialsService> {
    const module = await Test.createTestingModule({
      providers: [
        DevSeedCredentialsService,
        { provide: IdentityAccessApi, useValue: identity },
        { provide: LOCAL_PASSWORD_GENERATOR, useValue: generate },
      ],
    }).compile();

    return module.get(DevSeedCredentialsService);
  }

  it('is wired by Nest from the identity facade and the password generator token', async () => {
    await expect(build()).resolves.toBeInstanceOf(DevSeedCredentialsService);
  });

  it('makes and hashes a password for each account the plan creates, and for no other', async () => {
    const service = await build();

    const credentials = await service.prepare(
      planWith({ [first.employeeCode]: 'create', [second.employeeCode]: 'present', [third.employeeCode]: 'create' }),
    );

    expect([...credentials.keys()]).toEqual(
      DEMO_PEOPLE.map((person) => person.employeeCode).filter((code) => code !== second.employeeCode),
    );
    expect(credentials.get(first.employeeCode)).toEqual({
      password: 'generated-1',
      hash: 'hash(generated-1)',
      hashPolicyVersion: 7,
    });
    expect(identity.prepareCredential).toHaveBeenCalledTimes(2);
    expect(identity.prepareCredential).toHaveBeenCalledWith('generated-1', first.workEmail);
  });

  it('generates nothing when no account is to be created', async () => {
    const service = await build();

    const credentials = await service.prepare(planWith({ [first.employeeCode]: 'present' }));

    expect(credentials.size).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    expect(identity.prepareCredential).not.toHaveBeenCalled();
  });
});
