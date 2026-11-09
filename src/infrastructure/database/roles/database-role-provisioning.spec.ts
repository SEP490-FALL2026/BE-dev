import { RUNTIME_SEQUENCE_DEFAULT, RUNTIME_SEQUENCE_EXCEPTIONS } from '../database-role-judgement';
import { grantStatements } from './database-role-provisioning';

const LEGACY_SYNC = ['personnel_notice_seq', 'saas_issue_seq'];
const statementsFor = (tables: string[], sequences: string[]): string[] =>
  grantStatements('slm_app', 'slm_deploy', 'slm_runtime', { tables, sequences });
const BLANKET = 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO "slm_runtime"';

/**
 * The grants of `ops:db-roles` for sequences, from the one policy of `database-role-judgement.ts` that the verifier
 * judges against. USAGE everywhere, and exactly SELECT and UPDATE on the two sequences that `NoticeRepo.nextCode` (BM-09) and
 * `SaasIssueRepo.nextCode` (BM-11) read and lift with `setval` — never anything wider, never a sequence the schema lacks.
 */
describe('grantStatements for sequences', () => {
  it('has one policy: USAGE by default and SELECT, UPDATE on exactly the two legacy-sync sequences', () => {
    expect(RUNTIME_SEQUENCE_DEFAULT).toEqual(['USAGE']);
    expect(RUNTIME_SEQUENCE_EXCEPTIONS).toEqual({
      personnel_notice_seq: ['SELECT', 'UPDATE'],
      saas_issue_seq: ['SELECT', 'UPDATE'],
    });
  });

  it('revokes and grants each present exception after the blanket USAGE, so a stray privilege cannot survive a reconcile', () => {
    const statements = statementsFor([], LEGACY_SYNC);
    const blanket = statements.indexOf(BLANKET);

    expect(blanket).toBeGreaterThan(-1);
    for (const name of LEGACY_SYNC) {
      const revoke = statements.indexOf(`REVOKE ALL ON SEQUENCE public."${name}" FROM "slm_runtime"`);
      const grant = statements.indexOf(`GRANT SELECT, UPDATE ON SEQUENCE public."${name}" TO "slm_runtime"`);

      expect(revoke).toBeGreaterThan(blanket);
      expect(grant).toBe(revoke + 1);
    }
  });

  it('does not touch a sequence that does not exist yet (an older schema baseline): no statement names it', () => {
    const none = statementsFor([], []);
    const one = statementsFor([], ['personnel_notice_seq']);

    expect(none.filter((statement) => LEGACY_SYNC.some((name) => statement.includes(name)))).toEqual([]);
    expect(one.filter((statement) => statement.includes('saas_issue_seq'))).toEqual([]);
    expect(one.filter((statement) => statement.includes('personnel_notice_seq'))).toHaveLength(2);
  });

  it('grants nothing but USAGE to every other sequence, now and in the default privileges of the next migration', () => {
    const statements = statementsFor(['audit_events'], LEGACY_SYNC);
    const sequenceGrants = statements.filter((statement) => /\bGRANT\b/.test(statement) && /SEQUENCE/.test(statement));

    expect(sequenceGrants).toEqual([
      BLANKET,
      'GRANT SELECT, UPDATE ON SEQUENCE public."personnel_notice_seq" TO "slm_runtime"',
      'GRANT SELECT, UPDATE ON SEQUENCE public."saas_issue_seq" TO "slm_runtime"',
      'ALTER DEFAULT PRIVILEGES FOR ROLE "slm_deploy" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "slm_runtime"',
    ]);
    expect(statements).not.toContain('GRANT SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "slm_runtime"');
    expect(statements.filter((statement) => /ALL SEQUENCES|ON SEQUENCES/.test(statement))).toEqual([
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC',
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "slm_runtime"',
      BLANKET,
      'ALTER DEFAULT PRIVILEGES FOR ROLE "slm_deploy" IN SCHEMA public REVOKE ALL ON SEQUENCES FROM "slm_runtime"',
      'ALTER DEFAULT PRIVILEGES FOR ROLE "slm_deploy" IN SCHEMA public GRANT USAGE ON SEQUENCES TO "slm_runtime"',
    ]);
  });

  it('keeps the table exceptions as they were', () => {
    const statements = statementsFor(['audit_events', '_prisma_migrations'], []);

    expect(statements).toContain('GRANT INSERT, SELECT ON TABLE public."audit_events" TO "slm_runtime"');
    expect(statements).toContain('REVOKE ALL ON TABLE public."_prisma_migrations" FROM "slm_runtime"');
    expect(statements.filter((statement) => statement.includes('"_prisma_migrations"'))).toHaveLength(1);
  });
});
