/**
 * Empties the tables an installation test reads, through the append-only guards: every table that refuses TRUNCATE (the audit
 * trail, the approval records, the ledgers) has its user triggers switched off for the statement and on again after it, so
 * `TRUNCATE ... CASCADE` can reach them through the foreign keys of `organizations`.
 */
const GUARDED_TABLES = `
  SELECT DISTINCT g.tgrelid::regclass AS tbl
    FROM pg_trigger g
   WHERE NOT g.tgisinternal AND (g.tgtype & 32) <> 0`;

const switchTriggers = (action: 'DISABLE' | 'ENABLE') => `
  DO $$
  DECLARE t record;
  BEGIN
    FOR t IN ${GUARDED_TABLES} LOOP
      EXECUTE format('ALTER TABLE %s ${action} TRIGGER USER', t.tbl);
    END LOOP;
  END $$;`;

export const RESET_INSTALLATION_SQL = `
  ${switchTriggers('DISABLE')}
  TRUNCATE audit_events, role_grants, password_credentials, app_users, employee_placements, employees,
           departments, cost_centers, organizations CASCADE;
  ${switchTriggers('ENABLE')}`;
