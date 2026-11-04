# Authentication, files and jobs

## Authentication and authorization

- Internal accounts: Argon2id passwords, short-lived HS256 access token, rotating refresh token. Login and
  refresh return both in the response body; refresh and logout take the refresh token in the request body.
  The API sets and reads no cookie, so a client must keep the refresh token out of logs and URLs
  (design: ADR-0011, Proposed, amended 17/10/2026; developer review pending). Login, refresh, logout, `/me`,
  account creation, invitations, activation, locking, role grants (slices 1a/1b), forgot/reset and change password
  (slice 1c) and Super Admin transfer exist and are merged to `dev`; none is reviewed or accepted.
- The refresh token is an **opaque** random 256-bit credential, not a JWT. Only its SHA-256 is stored; it is
  authenticated by hash lookup, row locks and the authoritative session/account/employee state in PostgreSQL,
  rotated once per use, and a replayed token revokes the session. Never pass it to `jwt.verify`, never turn it into
  a JWT, and never add Redis or a second session store without a new ADR. Never store or print a raw token.
- Client contract (Owner Q1–Q3, 18/10/2026) — the one source for web and mobile clients:
  - Login and refresh return `expiresAt` (expiry of the access token) and `refreshExpiresAt` (stored expiry of the
    refresh token in the same response: the idle timeout, capped at the absolute session expiry). Near the end of a
    session `refreshExpiresAt` can be earlier than `expiresAt`; do not assume an order.
  - Web keeps the refresh token in memory, never in `localStorage`; how a reload that loses it is handled is a later UX
    design. Mobile storage is not decided yet: store it securely, never log it. Never put a token in a URL or a log.
  - Single-flight refresh: one refresh at a time, and replace both tokens from each successful response. Sending a
    spent token again is replay and ends the session; there is no grace window.
  - Refresh before `expiresAt`; after `refreshExpiresAt` sign in again. A refresh answered 401 `AUTH.SESSION_INVALID`
    means discard both tokens and sign in again; 503 `AUTH.UNAVAILABLE` means keep the refresh token and retry.
  - Logout sends the refresh token in the body and is 204 whether or not a session was open.
- Global guards deny by default: every route declares one of `@Public()`, `@AuthenticatedOnly()`,
  `@RequireRoles(...)` (missing means 500). Session, account status and employee status are checked in the
  database on every request; roles are never read from the token. Never use an always-accept verifier
  outside isolated tests.
- Public routes need @Public(), an entry in the public allowlist of `test/http/platform/api-inventory.http-spec.ts`
  and anonymous HTTP tests. Add authorization from the US before opening real business access.
- Passwords enter through the installation prompt, `/auth/login`, `/auth/invitations/redeem`, `/auth/password-resets`
  or `/me/password`; they are never accepted
  as arguments or environment variables, and never logged or stored in audit (`AuditService` rejects
  keys that look like secrets).
- Transport limits only bound the body; the password policy (12–128) decides and names the reason. A new password
  (reset, change, invitation) may carry up to 1024 characters, so 129–1024 answers `AUTH.PASSWORD_POLICY_VIOLATION`
  and longer answers `VALIDATION_ERROR` (AUTH.2 / F-31); the login and current passwords stay at 256.
- `Authorization: Bearer <token>`: the scheme is case-insensitive (`bearer`, `BEARER`, RFC 9110), the rest is exact — one
  space and a token without whitespace (AUTH.1 / F-18).
- Never trust client-supplied privileges. A signed JWT alone does not establish
  current account status or resource permission.
- Distinguish invalid credentials from unavailable dependencies. Do not log secrets.
- Global rate limiting uses per-process memory, with a separate counter for each route and IP
  (Owner decision 14/10/2026, R-07; pinned by `test/http/platform/rate-limit.http-spec.ts`).
  Login failure throttling is separately keyed by normalized email: only failed logins increase
  its failure counter, after the password check (Owner confirmed the existing spec, R-06).
  See [G0/G1 remediation review](../reviews/g0-g1-remediation-2026-10-15/README.md). Redis is queue infrastructure.
- Configure TRUST_PROXY_HOPS only for trusted ingress that overwrites client headers.

## Storage and jobs

- Only the API mounts the object storage (ADR-0014, contract files, signed links); the queue is mounted in no graph
  (E2 = A) and has no processors. A slice that mounts either restores its production validation (Redis password,
  HTTPS storage endpoint). A storage that cannot answer is a 503, never a 500 and never a successful write.
  `EmailDispatchLoop` in the separate worker polls PostgreSQL `EmailOutbox` and sends via SMTP
  outside the business transaction (ADR-0012, Proposed). Delivery is at-least-once. `RequestWorkLoop` also projects the audit
  events of requests into the in-app inbox: one transaction per batch locks the cursor (`FOR UPDATE SKIP LOCKED`), reads only
  events older than `DB_TRANSACTION_TIMEOUT_MS` plus five seconds (an event is stamped by the writing process when its insert is
  sent, before it commits), writes the notices and moves the cursor, so a failed pass writes nothing and a repeated one writes nothing twice.
  A notice never carries a secret, an amount or a finding of the budget: the closed table of codes and parameter keys is in
  `inbox.policy.ts`. The events of the lines of a request for a group (`ACCESS_REQUEST.LINE_*`) carry `beneficiaryEmployeeId`, so a
  person is told of their own line only, with the sender. `RequestWorkLoop` also runs the reminders of late steps (`StepSlaSweepService`): on a working day of the
  organization, for each open step or request in the queue of its head that is past its deadline and has no reminder today, one
  transaction takes the row `FOR UPDATE SKIP LOCKED`, writes the reminder, the people it went to, a notice in each inbox and the
  audit event together, and the unique key `(subject, business day)` makes two workers write one. The pass writes nothing to
  `access_requests`, `access_request_steps`, approval records, spend decisions or commitments, sends no mail, and a failed
  subject rolls back whole and is tried again on the next tick. Run one by hand with `StepSlaSweepService.sweep(now)`.
  The API (not the worker) runs `OrganizationChangeSweeper` once an hour, the first pass five minutes after start, with an unreferenced
  timer: it tells the modules that act on the organization (the listeners added to `OrganizationChangeListeners`)
  of the placements and head periods that took effect on a day that has come and were not told. One transaction for each change
  records it in `organization_change_announcements` (unique `(kind, subject_id)`, so two instances tell it once) and calls the
  listeners; a listener that throws rolls that change back and it is tried again at the next pass, and a failed pass only logs
  (one line that names the kind of error, the code and whether it can be retried: the bullet after this one).
  A change written for today is told in the transaction that writes it. It runs in the API graph because that is where every
  listener (requests, personnel) is registered. Run one by hand with `OrganizationHistoryService.announceDueChanges(day)`.
  The API also runs `HandoverDutySweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each
  handover duty whose deadline has passed unconfirmed it writes `overdue_noticed_at`, the audit event `HANDOVER_DUTY.OVERDUE` and an inbox
  notice (`HANDOVER_CONFIRMATION_OVERDUE`) to the person who confirms today and the IT Admin in charge in one transaction, so a duty is told
  once for a deadline however many instances run; a failed pass only logs. Run one by hand with
  `HandoverOverdueService.noticeOverdue(now)`.
  The API also runs `TransferReviewSweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each open
  transfer review past its deadline whose department has a head today it writes `overdue_noticed_at` and the audit event
  `TRANSFER_REVIEW.OVERDUE` in one transaction, so a review is told once however many instances run; a department without a head is
  left for a later pass, and a failed pass only logs. It only tells: it never revokes, reassigns or decides. Run one by hand with
  `TransferReviewOverdueService.noticeOverdue(now)`.
  The API also runs `LeaveReturnSweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each long leave
  that runs past its approved day of return it writes `return_overdue_noticed_for` (that approved day) and the audit event
  `LONG_LEAVE.RETURN_OVERDUE` in one transaction, so a day is told once however many instances run, and told again when the day moves
  and passes; a failed pass only logs. It only tells: the work state of a person never changes by the calendar. Run one by hand with
  `LeaveOverdueService.noticeOverdue(now)`.
  The API also runs `ServiceAccountDutySweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each open
  service account whose responsible person has a transfer or a departure that is not closed and whose day has passed it writes a row of
  `service_account_duty_notices` (unique for the account and the day), the audit event `SERVICE_ACCOUNT_DUTY.OVERDUE` and an inbox notice
  (`SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE`) to the IT Admin in charge of the owning department in one transaction, so a day is told once however
  many instances run; a failed pass only logs. It only tells: the transfer or the departure still takes
  effect, the account keeps its person and nothing is revoked. It reads which people have a file that waits through the provider that the
  personnel module registers, so it finds nothing in a process that does not load it. Run one by hand with
  `ServiceAccountDutyService.noticeOverdue(now)`.
  The API also runs `ExpiryReminderSweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each open
  personal right whose end date falls between today and seven days ahead it writes, in one transaction, at most three rows of
  `assignment_expiry_reminders` (unique for the right, the end date and the audience: the holder, the head of their department today, the
  IT Admin in charge while they can act as one; none for a head nobody is) and, for each new row, the audit event
  `LICENSE_ASSIGNMENT.EXPIRY_REMINDER` and an inbox notice (`LICENSE_EXPIRY_REMINDER`), so a person is told once however many instances run;
  a failed pass only logs. It only tells: the right stays in force, nothing is revoked or renewed
  by the calendar, and the queue of the rights that have ended is read from the assignments, not stored. Run one by hand with
  `ExpiryReminderService.noticeDue(now)`.
  The API also runs `NoticeOverdueSweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each notice of a
  department head that still waits for the IT Admin past its day (`personnel_notices.due_on`, fixed when it was sent from
  `PERSONNEL_NOTICE_REVIEW_WORKING_DAYS`) it sets `overdue_noticed_at` and writes the audit event `PERSONNEL_NOTICE.OVERDUE` in one
  transaction, so a notice is told once however many instances run; a failed pass only logs. It only tells: the notice is never recorded or
  rejected by the calendar and the person it is about is not changed. Run one by hand with `NoticeOverdueService.noticeOverdue(now)`.
  The API also runs `SaasIssueSweeper` once an hour (the first pass five minutes after start, unreferenced timer): it closes each resolved
  report of an error in a SaaS right whose last day to reopen (`saas_issues.reopen_until`, fixed when it was resolved from
  `SAAS_ISSUE_REOPEN_WORKING_DAYS`) has passed (state `CLOSED`, a `SYSTEM` entry and the audit event `SAAS_ISSUE.CLOSED`, under the row lock),
  and for each new report whose day to be taken up (`response_due_on`, fixed when it was sent from `SAAS_ISSUE_RESPONSE_WORKING_DAYS`) has
  passed it sets `response_overdue_noticed_at` and writes the audit event `SAAS_ISSUE.RESPONSE_OVERDUE` in one transaction, so a report is
  told once however many instances run; a failed pass only logs. The reminder only tells: the report keeps its IT Admin and its state and
  is never closed by the calendar while it is not resolved. Run one by hand with `SaasIssueSweepService.run(now)`.
  The API also runs `SubscriptionRenewalSweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each term
  subscription period whose notice deadline falls from sixty days back to the largest `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` ahead it tells
  the milestones due (inbox notices `SUBSCRIPTION_RENEWAL_ALERT`, with the audit event `SUBSCRIPTION_RENEWAL.ALERT_SENT`, and
  `SUBSCRIPTION_RENEWAL_DATA_QUALITY` with `SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED` when the contract has no date to count from), flags a
  decision not carried out by its deadline late (`late_flagged_at`, the audit event `SUBSCRIPTION_RENEWAL.FLAGGED_LATE`, the notice
  `SUBSCRIPTION_RENEWAL_LATE`) and records the event of a deadline passed with no decision (`subscription_deadline_events`, unique per
  subscription and immutable, the audit event `SUBSCRIPTION.AUTO_RENEWAL_INCIDENT` or `SUBSCRIPTION.EXPIRY_MARKED` and its notice). It is
  idempotent however many instances run: each notice carries an event key (`subscription-renewal-alert:{subscription}:{base date}:{days}`,
  one per recipient), the late flag is a conditional update written once, and the deadline event has `ON CONFLICT DO NOTHING`; a failed
  pass only logs. It only tells and flags late: it never renews, cancels, decides or records an outcome, never changes a subscription or
  a seat, and a decision taken after the deadline is never voided. Run one by hand with `SubscriptionRenewalSweepService.sweep(now)`.
  The API also runs `BudgetAttachmentExpirySweeper` once an hour (the first pass five minutes after start, unreferenced timer): for each unattached document upload whose deadline has passed (`AWAITING_UPLOAD` older than 24 hours, `UPLOADED` older than 7 days) it marks the attachment `EXPIRED`, writes the audit event `BUDGET_ATTACHMENT.EXPIRED` with actor `SYSTEM`, and deletes the abandoned storage object(s) after commit; each file is picked and locked `FOR UPDATE SKIP LOCKED` inside its own transaction (a file a proposal send holds is skipped, never waited for; at most 100 per pass), attached, removed and discarded records are left untouched, and a failed pass only logs. Run one by hand with `BudgetAttachmentExpiryService.expire(now)`.
  The record of a departure has no job of its own: `EMPLOYEE_LEFT` is told once in the transaction that sets the employee `TERMINATED` (the
  unique `(kind, subject_id)` of the announcements makes a second telling a no-op), and a person who has left is refused by the sign-in and
  the access guard from their next action because they read the status of the employee, not a flag of the account. The reminder to the
  Super Admin to lock the account (`OFFBOARDING_CASE.ACCOUNT_LOCK_REMINDER`) and the alert of the departure are audit events only.
  The requests and grants of a person who leaves have no job either: nothing closes them by itself. The record writes the audit event
  `OFFBOARDING_CASE.OPEN_REQUESTS_FOUND` (how many of each) and the case shows a warning; once the person is `TERMINATED` the IT Admin closes
  each request with `POST /access-requests/{id}/cancellation`, which writes `ACCESS_REQUEST.CANCELLED` (the notice to the people concerned and
  to Finance is read from it by the status projection) and cancels the task of the grant, never touching a grant that is done. A request for a group is closed one person at a time with
  `POST /access-requests/{id}/lines/{employeeId}/departure-closure`, which writes `ACCESS_REQUEST.LINE_CANCELLED` (the sender is told of that line
  only, the others of the group are not) and ends the request only when its last live line is closed.
  The roles of a person who leaves have no job either: the record writes the audit event `OFFBOARDING_CASE.ROLE_HOLDER_FLAGGED` (the roles, the
  priority, the workspaces by name and whether an emergency account is declared, never a password, a key or the name of that account) once, again
  when the roles change before the last working day and, with the highest priority, when a person who left still holds the Super Admin role or a
  workspace. Nothing here locks, revokes or reassigns anything; the notification channel reads the event (`g4-notification-delivery`).
- A failed pass of a job (`*.job.ts`, the loops of the worker) or of a sweep that works record by record logs one line,
  `<kind> failed: <description>`, where the description is `describeForOperator`
  ([operator-error.ts](../../src/infrastructure/observability/operator-error.ts)): the class name of the error, its Prisma
  code or SQLSTATE, `retryable=true|false` (true when the database or a network connection was only unavailable for a while:
  deadlock, lock or statement timeout, a dropped or refused connection, SMTP included) and the name of the error underneath, one level. Never the message of the error, which can carry a
  name, an address or a secret. A loop over records names the record that failed (`step <id>`), and one failure does not
  stop the next record. An error that is not just something being unavailable for a while adds its stack frames as the trace argument
  of `logger.error` (`traceForOperator`; the frames carry no message). The pass behaves as before: it goes on at the next
  tick, and a listener that throws still rolls its transaction back. Never log `(error as Error).name`: gate `module-layout`
  fails on it anywhere in `src/`.
- Business modules call ObjectStoragePort rather than vendor SDKs.
- A signed upload link signs the declared `Content-Type` and `Content-Length` and lives two minutes; what was looked at is
  copied once to a key no upload link reaches before it is kept (ADR-0014). A download link is an `attachment` with the
  declared type, and a response that carries a link is `Cache-Control: no-store`.
- Opening a secret is counted per account in PostgreSQL (`license_key_reveal_windows`: 10 a minute, 200 a day), in the
  transaction that opens it and audits it; a refusal is 429 `HTTP_TOO_MANY_REQUESTS` and leaves the count as it was.
- A token in a file is masked before anything is stored, in the form with its spaces and invisible characters taken out;
  what is not a name at all is masked as invalid. The upload of an import takes one file and two small fields.
- Encryption keys are standard padded base64 of 32 bytes, and no two keys of either purpose, current or previous, are the
  same bytes. Only `NODE_ENV=test` may use a public secret or the public MinIO credentials.
- Check permissions before issuing short-lived signed URLs; objects remain private.
- Filenames, MIME, bytes, CSV/XLSX cells and queue payloads are untrusted input.
- Imports need limits, ownership/purpose checks and idempotency defined by the US.
- Retries must not duplicate business writes. PostgreSQL holds authoritative state;
  Redis/job IDs do not replace constraints or durable deduplication.
- Mocks do not prove real storage access, revocation or worker retry behavior.

[Architecture](../../ARCHITECTURE.md) ? [Tests](../../test/README.md).
