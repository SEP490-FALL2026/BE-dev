-- N-1 consistency check (read-only) for any database that ran a build with the client query_timeout but
-- without the N-1 fix (cbd8b5c / a8ba88f). Run as:
--   BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout = '60s'; \i n1-consistency-check.sql; ROLLBACK;
-- Each row is a SUSPECT to triage against the deployment window and request logs, not proof of damage.
-- Seed scripts, manual SQL and test fixtures produce false positives. An empty result does not prove absence of
-- damage: later legitimate updates can overwrite evidence, and acknowledged autocommit writes that ran on a poisoned
-- connection and were rolled back (or whole transactions committed after a 503) are not visible here.
-- Statement order per workflow: src/modules/identity-access/account-management.service.ts, auth.service.ts.

-- Q1 partial lock/unlock: status disagrees with the last lock/unlock audit
WITH last_status AS (
  SELECT DISTINCT ON (a.resource_id) a.resource_id, a.after->>'status' AS audited_status, a.occurred_at
  FROM audit_events a
  WHERE a.resource_type = 'AppUser' AND a.action IN ('APP_USER.LOCKED', 'APP_USER.UNLOCKED')
  ORDER BY a.resource_id, a.occurred_at DESC, a.id DESC)
SELECT 'Q1' AS check, u.id, u.status, COALESCE(ls.audited_status, 'ACTIVE') AS expected_status, ls.occurred_at, u.updated_at
FROM app_users u LEFT JOIN last_status ls ON ls.resource_id = u.id::text
WHERE u.status::text <> COALESCE(ls.audited_status, 'ACTIVE');

-- Q2 LOCKED account still has an open session or a usable invitation (lock revokes both in the same transaction)
SELECT 'Q2' AS check, u.id, 'open_session' AS problem, s.id::text AS ref
FROM app_users u JOIN auth_sessions s ON s.app_user_id = u.id
WHERE u.status = 'LOCKED' AND s.revoked_at IS NULL
UNION ALL
SELECT 'Q2', u.id, 'usable_invitation', t.token_hash
FROM app_users u JOIN account_action_tokens t ON t.app_user_id = u.id
WHERE u.status = 'LOCKED' AND t.consumed_at IS NULL AND t.revoked_at IS NULL;

-- Q3 lock side effects vs the counts recorded in APP_USER.LOCKED audits
WITH audited AS (
  SELECT resource_id AS app_user_id, SUM((after->>'sessionsRevoked')::int) AS sessions_audited,
         SUM((after->>'invitationsRevoked')::int) AS invites_audited
  FROM audit_events WHERE resource_type = 'AppUser' AND action = 'APP_USER.LOCKED' GROUP BY resource_id),
sess AS (SELECT app_user_id::text AS app_user_id, COUNT(*) AS sessions_revoked
         FROM auth_sessions WHERE revoked_reason = 'ACCOUNT_LOCKED' GROUP BY 1),
tok AS (SELECT app_user_id::text AS app_user_id, COUNT(*) AS invites_revoked
        FROM account_action_tokens WHERE revoked_reason = 'ACCOUNT_LOCKED' GROUP BY 1),
ids AS (SELECT app_user_id FROM audited UNION SELECT app_user_id FROM sess UNION SELECT app_user_id FROM tok)
SELECT 'Q3' AS check, ids.app_user_id, a.sessions_audited, s.sessions_revoked, a.invites_audited, t.invites_revoked
FROM ids LEFT JOIN audited a USING (app_user_id) LEFT JOIN sess s USING (app_user_id) LEFT JOIN tok t USING (app_user_id)
WHERE COALESCE(a.sessions_audited, 0) <> COALESCE(s.sessions_revoked, 0)
   OR COALESCE(a.invites_audited, 0) <> COALESCE(t.invites_revoked, 0);

-- Q4 role grants/revocations vs ROLE.GRANTED / ROLE.REVOKED audits
WITH g AS (SELECT app_user_id::text AS app_user_id, role::text AS role, COUNT(*) AS granted, COUNT(revoked_at) AS revoked
           FROM role_grants GROUP BY 1, 2),
a AS (SELECT resource_id AS app_user_id, after->>'role' AS role,
             COUNT(*) FILTER (WHERE action = 'ROLE.GRANTED') AS granted,
             COUNT(*) FILTER (WHERE action = 'ROLE.REVOKED') AS revoked
      FROM audit_events WHERE resource_type = 'AppUser' AND action IN ('ROLE.GRANTED', 'ROLE.REVOKED') GROUP BY 1, 2)
SELECT 'Q4' AS check, COALESCE(g.app_user_id, a.app_user_id) AS app_user_id, COALESCE(g.role, a.role) AS role,
       g.granted AS grant_rows, a.granted AS grant_audits, g.revoked AS revoke_rows, a.revoked AS revoke_audits
FROM g FULL JOIN a ON a.app_user_id = g.app_user_id AND a.role = g.role
WHERE COALESCE(g.granted, 0) <> COALESCE(a.granted, 0) OR COALESCE(g.revoked, 0) <> COALESCE(a.revoked, 0);

-- Q5a account without a creation audit
SELECT 'Q5a' AS check, u.id, u.activation_state, u.created_at FROM app_users u
WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.resource_type = 'AppUser' AND a.resource_id = u.id::text
                  AND a.action IN ('APP_USER.CREATED', 'INSTALLATION.SUPER_ADMIN_CREATED'));

-- Q5b invited account that never got an invitation token
SELECT 'Q5b' AS check, u.id, u.created_at FROM app_users u
WHERE u.activation_state = 'INVITED' AND NOT EXISTS (SELECT 1 FROM account_action_tokens t WHERE t.app_user_id = u.id);

-- Q5c invitation tokens vs APP_USER.INVITATION_SENT audits (create account + resend)
WITH t AS (SELECT app_user_id::text AS app_user_id, COUNT(*) AS tokens FROM account_action_tokens GROUP BY 1),
     a AS (SELECT resource_id AS app_user_id, COUNT(*) AS audits FROM audit_events
           WHERE resource_type = 'AppUser' AND action = 'APP_USER.INVITATION_SENT' GROUP BY 1)
SELECT 'Q5c' AS check, COALESCE(t.app_user_id, a.app_user_id) AS app_user_id, t.tokens, a.audits
FROM t FULL JOIN a ON a.app_user_id = t.app_user_id WHERE COALESCE(t.tokens, 0) <> COALESCE(a.audits, 0);

-- Q5d token without its outbox row
SELECT 'Q5d' AS check, t.token_hash, t.app_user_id, t.created_at FROM account_action_tokens t
WHERE NOT EXISTS (SELECT 1 FROM email_outbox o WHERE o.action_token_hash = t.token_hash);

-- Q6 partial redeem (credential -> activation -> consume token -> APP_USER.ACTIVATED audit)
SELECT 'Q6' AS check, u.id, 'credential_but_invited' AS problem FROM app_users u
WHERE u.activation_state = 'INVITED' AND EXISTS (SELECT 1 FROM password_credentials c WHERE c.app_user_id = u.id)
UNION ALL
SELECT 'Q6', u.id, 'consumed_token_but_invited' FROM app_users u
WHERE u.activation_state = 'INVITED'
  AND EXISTS (SELECT 1 FROM account_action_tokens t WHERE t.app_user_id = u.id AND t.consumed_at IS NOT NULL);

-- Q7a partial login: session without any refresh token
SELECT 'Q7a' AS check, s.id, s.app_user_id, s.created_at FROM auth_sessions s
WHERE NOT EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.session_id = s.id);

-- Q7b partial refresh: consumed token whose successor was never inserted
SELECT 'Q7b' AS check, r.token_hash, r.session_id, r.consumed_at FROM refresh_tokens r
WHERE r.replaced_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM refresh_tokens n WHERE n.token_hash = r.replaced_by);

-- Q7d replay revocation without its SESSION.REVOKED audit
SELECT 'Q7d' AS check, s.id, s.revoked_at FROM auth_sessions s
WHERE s.revoked_reason = 'REPLAY_DETECTED'
  AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.resource_type = 'AuthSession'
                  AND a.resource_id = s.id::text AND a.action = 'SESSION.REVOKED');

-- Q8 forensic signature of N-1: rows of more than one account written by ONE database transaction (same xmin).
-- No legitimate workflow touches more than one account per transaction. Rows changed later carry a new xmin.
WITH w AS (
  SELECT xmin::text AS xid, id AS app_user_id, 'app_users' AS tbl FROM app_users
  UNION ALL SELECT xmin::text, app_user_id, 'password_credentials' FROM password_credentials
  UNION ALL SELECT xmin::text, app_user_id, 'role_grants' FROM role_grants
  UNION ALL SELECT xmin::text, app_user_id, 'auth_sessions' FROM auth_sessions
  UNION ALL SELECT r.xmin::text, s.app_user_id, 'refresh_tokens' FROM refresh_tokens r JOIN auth_sessions s ON s.id = r.session_id
  UNION ALL SELECT xmin::text, app_user_id, 'account_action_tokens' FROM account_action_tokens
  UNION ALL SELECT xmin::text, resource_id::uuid, 'audit_events' FROM audit_events WHERE resource_type = 'AppUser')
SELECT 'Q8' AS check, xid, COUNT(DISTINCT app_user_id) AS accounts, array_agg(DISTINCT tbl) AS tables,
       array_agg(DISTINCT app_user_id) AS account_ids
FROM w GROUP BY xid HAVING COUNT(DISTINCT app_user_id) > 1;
