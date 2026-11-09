import { judgeSeatRows, maskSecretCells, sameJudgement } from './seat-baseline-rows.policy';
import { codesOf, facts, judgeOne, row, type ExistingAssignment } from '../../../../test/support/seat-baseline-facts';

describe('judgeSeatRows: overlap and the same identifier (AC-3, AC-9, INV-02)', () => {
  it('refuses the second personal row of one person on one subscription (AC-3)', () => {
    const results = judgeSeatRows(
      [
        row(2, { employee_code: 'E1', account_identifier: 'e1@congty.vn' }),
        row(3, { employee_code: 'E1', account_identifier: 'e1.alt@congty.vn' }),
      ],
      facts(),
    );

    expect(results.map((result) => result.outcome)).toEqual(['VALID', 'ERROR']);
    expect(codesOf(results[1])).toEqual(['OVERLAP']);
  });

  it('refuses a person who already holds a personal seat that is still open', () => {
    const existing: ExistingAssignment[] = [
      {
        employeeId: 'e1',
        kind: 'PERSONAL',
        normalizedAccountIdentifier: 'old@congty.vn',
        effectiveFrom: '2026-01-01',
        validUntil: null,
      },
    ];

    expect(codesOf(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn' }, { existing }))).toEqual([
      'OVERLAP',
    ]);
  });

  it('lets a person whose earlier seat has ended before the new one starts take another', () => {
    const existing: ExistingAssignment[] = [
      {
        employeeId: 'e1',
        kind: 'PERSONAL',
        normalizedAccountIdentifier: 'old@congty.vn',
        effectiveFrom: '2026-01-01',
        validUntil: '2026-09-01',
      },
    ];

    expect(judgeOne({ employee_code: 'E1', account_identifier: 'e1@congty.vn' }, { existing }).outcome).toBe('VALID');
  });

  it('lets one person hold a personal seat and two service accounts on the same subscription (AC-9)', () => {
    const bot = (identifier: string) => ({
      employee_code: 'E2',
      account_identifier: identifier,
      kind: 'service',
      reason: 'CI',
      cost_center_code: 'CC-DES',
    });
    const results = judgeSeatRows(
      [
        row(2, { employee_code: 'E2', account_identifier: 'e2@congty.vn' }),
        row(3, bot('ci-bot')),
        row(4, bot('release-bot')),
      ],
      facts(),
    );

    expect(results.map((result) => result.outcome)).toEqual(['VALID', 'VALID', 'VALID']);
  });

  it('refuses an identifier already used, whatever its case and spaces, in the file or in what is kept (AC-9)', () => {
    const bot = (code: string, identifier: string) => ({
      employee_code: code,
      account_identifier: identifier,
      kind: 'service',
      reason: 'CI',
      cost_center_code: 'CC-DES',
    });
    const inFile = judgeSeatRows([row(2, bot('E2', 'ci-bot')), row(3, bot('E3', ' CI-Bot '))], facts());
    const kept: ExistingAssignment[] = [
      {
        employeeId: 'e9',
        kind: 'SERVICE',
        normalizedAccountIdentifier: 'ci-bot',
        effectiveFrom: '2026-01-01',
        validUntil: null,
      },
    ];

    expect(codesOf(inFile[1])).toEqual(['ACCOUNT_IDENTIFIER_IN_USE']);
    expect(codesOf(judgeOne(bot('E2', 'CI-BOT'), { existing: kept }))).toEqual(['ACCOUNT_IDENTIFIER_IN_USE']);
  });

  it('lets an identifier of an assignment that has ended be used again', () => {
    const kept: ExistingAssignment[] = [
      {
        employeeId: 'e9',
        kind: 'SERVICE',
        normalizedAccountIdentifier: 'ci-bot',
        effectiveFrom: '2026-01-01',
        validUntil: '2026-09-01',
      },
    ];

    expect(
      judgeOne(
        {
          employee_code: 'E2',
          account_identifier: 'ci-bot',
          kind: 'service',
          reason: 'CI',
          cost_center_code: 'CC-DES',
        },
        { existing: kept },
      ).outcome,
    ).toBe('VALID');
  });
});

describe('judgeSeatRows: the seats bought (AC-2, AC-12, INV-01)', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      row(index + 2, { employee_code: `P${index}`, account_identifier: `p${index}@congty.vn` }),
    );
  const people = (count: number) =>
    new Map(
      Array.from({ length: count }, (_, index) => [
        `P${index}`,
        { id: `p${index}`, status: 'ACTIVE', employmentType: 'STAFF', hireDate: '2020-01-01' } as const,
      ]),
    );

  it('refuses the rows after the last free seat, in the order of the file: 12 rows for 10 seats (AC-2)', () => {
    const results = judgeSeatRows(
      many(12),
      facts({ target: { kind: 'SUBSCRIPTION', purchasedQuantity: 10 }, employees: people(12) }),
    );

    expect(results.filter((result) => result.outcome === 'VALID')).toHaveLength(10);
    expect(results.slice(10).map(codesOf)).toEqual([['SEAT_LIMIT_EXCEEDED'], ['SEAT_LIMIT_EXCEEDED']]);
    expect(results.slice(10).map((result) => result.lineNumber)).toEqual([12, 13]);
  });

  it('counts the seats already taken: 8 of 10 taken and 5 rows leave room for 2', () => {
    const existing: ExistingAssignment[] = Array.from({ length: 8 }, (_, index) => ({
      employeeId: `x${index}`,
      kind: 'PERSONAL' as const,
      normalizedAccountIdentifier: `x${index}@congty.vn`,
      effectiveFrom: '2026-01-01',
      validUntil: null,
    }));
    const results = judgeSeatRows(
      many(5),
      facts({ target: { kind: 'SUBSCRIPTION', purchasedQuantity: 10 }, employees: people(5), existing }),
    );

    expect(results.filter((result) => result.outcome === 'VALID')).toHaveLength(2);
  });

  it('gives a seat back that an ended assignment held: it does not count', () => {
    const existing: ExistingAssignment[] = [
      {
        employeeId: 'x',
        kind: 'PERSONAL',
        normalizedAccountIdentifier: 'x@congty.vn',
        effectiveFrom: '2026-01-01',
        validUntil: '2026-09-01',
      },
    ];
    const results = judgeSeatRows(
      many(1),
      facts({ target: { kind: 'SUBSCRIPTION', purchasedQuantity: 1 }, employees: people(1), existing }),
    );

    expect(results[0].outcome).toBe('VALID');
  });

  it('does not check the seats of an internal plan, which has none bought (AC-12)', () => {
    const results = judgeSeatRows(
      many(30),
      facts({ target: { kind: 'PLAN', purchasedQuantity: null }, employees: people(30) }),
    );

    expect(results.every((result) => result.outcome === 'VALID')).toBe(true);
  });

  it('gives a row that is refused for overlap no seat either, so a later row still finds one', () => {
    const results = judgeSeatRows(
      [
        row(2, { employee_code: 'E1', account_identifier: 'e1@congty.vn' }),
        row(3, { employee_code: 'E1', account_identifier: 'e1.alt@congty.vn' }),
        row(4, { employee_code: 'E2', account_identifier: 'e2@congty.vn' }),
      ],
      facts({ target: { kind: 'SUBSCRIPTION', purchasedQuantity: 2 } }),
    );

    expect(results.map((result) => result.outcome)).toEqual(['VALID', 'ERROR', 'VALID']);
  });

  it('gives a row that is wrong in itself no seat, so the next valid row takes it', () => {
    const results = judgeSeatRows(
      [
        row(2, { employee_code: 'E1', account_identifier: 'e1@gmail.com' }),
        row(3, { employee_code: 'E2', account_identifier: 'e2@congty.vn' }),
      ],
      facts({ target: { kind: 'SUBSCRIPTION', purchasedQuantity: 1 } }),
    );

    expect(results.map((result) => result.outcome)).toEqual(['ERROR', 'VALID']);
  });
});

describe('maskSecretCells (AC-9: a secret is never kept)', () => {
  it('replaces an identifier that looks like a secret and leaves the rest of the row as it is', () => {
    expect(maskSecretCells({ employee_code: 'E2', account_identifier: 'ghp_abc123', kind: 'service' })).toEqual({
      employee_code: 'E2',
      account_identifier: '[masked]',
      kind: 'service',
    });
    expect(maskSecretCells({ employee_code: 'E2', account_identifier: 'ci-bot' })).toEqual({
      employee_code: 'E2',
      account_identifier: 'ci-bot',
    });
  });

  it('judges a stored row again as the token it replaced, so a preview with a token still confirms (AC-9)', () => {
    const cells = {
      employee_code: 'E2',
      account_identifier: 'ghp_abc123',
      kind: 'service',
      reason: 'CI',
      cost_center_code: 'CC-DES',
    };
    const preview = judgeOne(cells);
    const confirmed = judgeOne(maskSecretCells(cells));

    expect(codesOf(preview)).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
    expect(codesOf(confirmed)).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
    expect(sameJudgement(preview, confirmed)).toBe(true);
  });

  it('masks an identifier that is not a name at all, as invalid: a secret of a shape nobody knows looks like that (SEC-03)', () => {
    const cells = { employee_code: 'E2', account_identifier: 'ghp abc 123' };

    const kept = maskSecretCells(cells);

    expect(kept).toEqual({ employee_code: 'E2', account_identifier: '[masked: invalid]' });
    expect(codesOf(judgeOne(cells))).toEqual(['ACCOUNT_IDENTIFIER_INVALID']);
    expect(sameJudgement(judgeOne(cells), judgeOne(kept))).toBe(true);
  });

  it.each([
    ['a space in front', ' ghp_abc123 '],
    ['a zero-width space inside', 'ghp_abc​123'],
    ['a zero-width joiner after the prefix', 'ghp_\u200dabc123'],
    ['a byte order mark in front', '\ufeffghp_abc123'],
    ['full-width letters', 'ｇｈｐ_abc123'],
    ['a space inside the shape', 'github_pat_ abc123def456'],
    ['tabs and a newline', 'ghp_\tabc\n123'],
  ])('masks a token however it is dressed: %s, as the token it is (SEC-03)', (_name, identifier) => {
    const cells = { employee_code: 'E2', account_identifier: identifier };

    const kept = maskSecretCells(cells);

    expect(kept.account_identifier).toBe('[masked]');
    expect(JSON.stringify(kept)).not.toMatch(/abc|123/);
    expect(codesOf(judgeOne(cells))).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
    expect(codesOf(judgeOne(kept))).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
  });

  it('keeps an ordinary account as it is', () => {
    const cells = { employee_code: 'E2', account_identifier: 'ci-bot' };

    expect(maskSecretCells(cells)).toEqual(cells);
  });
});

describe('sameJudgement', () => {
  it('is the same when the outcome and the error codes are, whatever their order', () => {
    const a = { outcome: 'ERROR', errors: [{ code: 'OVERLAP' }, { code: 'SEAT_LIMIT_EXCEEDED' }] } as const;
    const b = { outcome: 'ERROR', errors: [{ code: 'SEAT_LIMIT_EXCEEDED' }, { code: 'OVERLAP' }] } as const;

    expect(sameJudgement(a, b)).toBe(true);
  });

  it('differs when the outcome or a code does', () => {
    expect(sameJudgement({ outcome: 'VALID', errors: [] }, { outcome: 'ERROR', errors: [{ code: 'OVERLAP' }] })).toBe(
      false,
    );
    expect(
      sameJudgement(
        { outcome: 'ERROR', errors: [{ code: 'OVERLAP' }] },
        { outcome: 'ERROR', errors: [{ code: 'EMPLOYEE_NOT_FOUND' }] },
      ),
    ).toBe(false);
  });
});
