import { PreflightBlocker, PreflightInformation, PreflightReport } from './migration-preflight.types';

/** The report as one JSON object, newline-terminated. */
export function preflightJson(report: PreflightReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * What each blocker means and the decision it needs. No command here repairs data: the merged migration cannot be
 * changed (`P29-MIGRATION=B-FORWARD`), and the application has no operation that writes a department for a day the
 * records do not cover or moves recorded cost-allocation history; inventing one would invent HR or finance history.
 */
const DECISION: Record<PreflightBlocker['code'], string> = {
  MIGRATION_FAILED:
    'Prisma recorded a failed attempt and refuses every later deploy. The attempt rolled back (no data changed); the ' +
    'Owner decides how this database continues (restore the pre-deploy backup, or recreate it).',
  COST_ALLOCATION_NAMES_COMPANY:
    'A recorded cost allocation (history that never changes) gives a share to a COMPANY Cost Center. The merged ' +
    'migration cannot delete that Cost Center while it is named, and QĐ-86 gives the share no deterministic Unit: ' +
    'Owner/data decision (recreate this database, or keep it on the code before the unit-only migration).',
  DEPARTMENT_CHARGED_TO_COMPANY:
    'A department is charged to a COMPANY Cost Center, which the application never allowed: Owner/data decision on ' +
    "the department's Unit before deploying.",
  SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START:
    'The merged migration owns a service account by the department of its responsible person on the day the seat ' +
    'started, and the records place the person in no department that day (an employee import places people from the ' +
    'day of the import). Owner/data decision: recreate this database, or record the department of that day on an ' +
    'authoritative HR basis outside this command.',
  SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY:
    'The responsible person is in no department on the day the service account was recorded, so QĐ-86c gives it no ' +
    'owning department: Owner/data decision.',
  SUBSCRIPTION_OWNER_EXPANSION_REQUIRED:
    'This database is before the owner-department expansion (it has neither the column nor the assignment table) and it ' +
    'holds this subscription, which this release cannot give an owner department: it requires every subscription to have ' +
    'one, recorded from the purchase or contract basis. Deploy the compatibility release first (it adds the column and the ' +
    'table), record the owner of each subscription on it with `pnpm ops:assign-subscription-owner`, run this command again, ' +
    'then deploy this release. Nothing is inferred.',
  SUBSCRIPTION_OWNER_UNASSIGNED:
    'This release requires every subscription to have an owner department, and this one has none and no ' +
    'valid assignment (or an assignment that conflicts with its department). Record it from the purchase or contract ' +
    'basis, once per subscription, on the compatibility release that is running: `pnpm ops:assign-subscription-owner ' +
    '--subscription <id> --department <code> --basis <reference> --operator <reference> --environment LOCAL_TEST|SHARED`. ' +
    'Nothing is inferred, and there is no bulk form.',
  SUBSCRIPTION_OWNER_SCHEMA_PARTIAL:
    'The database has the owner-department column or the assignment table but not both, which no migration of this ' +
    'repository produces. Do not deploy: Owner/operator decision on how this database got there.',
  COST_CENTER_DIRECTION_EXPANSION_REQUIRED:
    'This database is before the Cost Center link of the compatibility release (none of its column and two tables exist) ' +
    'and it holds this organization: this release needs every Cost Center to belong to one department, activated and ' +
    'linked on the compatibility release. Deploy the compatibility release first; once the host reports it ready, run ' +
    '`pnpm ops:cost-center-direction activate` and link each Cost Center that belongs to no department with ' +
    '`pnpm ops:cost-center-direction link`; run this command again, then deploy this release.',
  COST_CENTER_UNLINKED:
    'Every Cost Center belongs to one department (QĐ-87d(1)) and this release refuses to deploy over one ' +
    'that belongs to none — including one the previous release created after the compatibility migration. Finance ' +
    'identifies the department from an authoritative basis (the Super Admin first creates it with departmentCreate when ' +
    'none is valid), then, once per Cost Center: `pnpm ops:cost-center-direction link --cost-center <id> --department ' +
    '<code> --basis <reference> --approved-by <Finance reference> --operator <reference> --environment LOCAL_TEST|SHARED`. ' +
    'Nothing is inferred, there is no bulk form, and nothing is retired or deleted.',
  COST_CENTER_DIRECTION_NOT_ACTIVATED:
    'The operator has not activated the Cost Center link of this organization, and the migration of this release refuses ' +
    'to run until it is. Only after the deployment host reports the compatibility release ready (releases/current-image ' +
    'names its image), run on that release `pnpm ops:cost-center-direction activate --release-evidence <deploy run and ' +
    'image SHA> --approved-by <release owner reference> --operator <reference> --environment LOCAL_TEST|SHARED`.',
  COST_CENTER_LINK_MISMATCH:
    'A department names a Cost Center that belongs to another department. The sync triggers of the compatibility ' +
    'migration keep the two equal, so this should not exist: do not deploy; Owner/operator decision on how this database got there.',
  COST_CENTER_DIRECTION_SCHEMA_PARTIAL:
    'The database has some, not all, of the Cost Center link column and its two tables, which no migration of this ' +
    'repository produces. Do not deploy: Owner/operator decision on how this database got there.',
  PERSONNEL_NOTICE_RETIRED_KIND_PENDING:
    'A BM-09 notice about a change of job title still waits, and this release takes no such notice ' +
    '(QĐ-87e). Reject it on the running release with the reason "Loại BM-09 đã bỏ (QĐ-87e, D-1)"; nothing is converted.',
  DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING:
    'A transfer that changes the job title only still waits, and this release takes no such transfer ' +
    '(QĐ-87e). Cancel it on the running release with the reason "Điều chuyển chỉ đổi chức vụ đã bỏ (QĐ-87e, D-1)"; nothing is converted.',
  SERVICE_ACCOUNT_MOVE_PENDING:
    'A proposal to move a service account to another department still waits, and this release has no such ' +
    'move (QĐ-89c). Cancel it on the running release with serviceAccountMoveCancel and the reason "Chuyển phòng tài khoản ' +
    'dịch vụ đã bỏ (QĐ-89c)"; if the previous release created one after the last preflight, cancel that one too. Nothing is converted.',
  BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS:
    'A budget proposal was given back because its first version was refused, and the records do not say deterministically what ' +
    'came of it (a refusal that does not match the return, several refusals, a proposal sent after the return that does not point ' +
    'back at it, or two that send it again). The migration of this release reconciles only the cases it can prove; this one is not ' +
    'guessed: Owner/operator decision for each proposal on a restored copy, then run this command again.',
  DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT:
    'This release gives a department head the role MANAGER as a grant on the account (QĐ-93a), and this head, today or from a ' +
    'later day, has no account to carry it. Fix it in the running release before the deploy: the Super Admin invites the ' +
    'person, or ends the head period. Nothing is inferred and the migration changes no row of its own accord.',
  DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD:
    'The spending approver heads a department today or from a later day, and this release allows no one to be both (QĐ-93b). ' +
    'Fix it in the running release: the Super Admin hands the spending approver role over, or names another head. Nothing is inferred.',
  DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE:
    'The spending approver also holds SUPER_ADMIN, IT_ADMIN or FINANCE, which this release does not allow together with the ' +
    'spending approver role (QĐ-93b). Fix it in the running release: revoke the other role or hand the spending approver role over.',
  DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT:
    'The spending approver has no account, so the role cannot become a grant on one. Fix it in the running release: the Super ' +
    'Admin invites the person (a locked, not yet activated or leaving holder is carried over as it is), or hands the role over.',
};

/** What each row to attend to later is, and how the operator resolves it. */
const INFORMATION: Record<PreflightInformation['code'], { heading: (count: number) => string; how: string }> = {
  BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE: {
    heading: () => 'These budget proposals were given back because their first version was refused.',
    how:
      'The migration of this release gives each back to `REVIEWED` (R1), or links it to the proposal that sent it ' +
      'again (R2), with an audit record each; nothing is for the operator to do:',
  },
  SERVICE_ACCOUNT_STILL_IN_FORCE: {
    heading: (count) => `${count} service account(s) are still in force.`,
    how:
      'There is no service account any more (QĐ-110m) and no operation that ends or converts one. The migration ' +
      '`20261113000900_licensing_service_accounts_converted` converts each into the flagged seat of an IT Admin and keeps the ' +
      'ones it cannot yet (its notice names the reason); once the reason has passed, run that file again as ' +
      '`docs/guides/service-account-conversion.md` says. The cleanup release that drops the kind needs none left:',
  },
};

/** The text report: the verdict, what a deploy would change, and each blocked row with the decision it needs. */
export function formatPreflight(report: PreflightReport): string {
  const lines = [`Preflight: ${report.status} (${report.history})`];
  if (report.status === 'BLOCKED') {
    lines.push('Do not run `prisma migrate deploy` on this database. Blocked rows:');
    for (const code of [...new Set(report.blockers.map((blocker) => blocker.code))]) {
      lines.push(`  ${code}`, `    ${DECISION[code]}`);
      for (const blocker of report.blockers.filter((item) => item.code === code))
        lines.push(`    - ${rowText(blocker)}`);
    }
  } else {
    lines.push('`prisma migrate deploy` may run. Back up the database first (the deploy workflow does).');
  }
  for (const code of [...new Set(report.information.map((item) => item.code))]) {
    const items = report.information.filter((entry) => entry.code === code);
    lines.push(`${INFORMATION[code].heading(items.length)} ${INFORMATION[code].how}`, `  ${code}`);
    for (const item of items) lines.push(`    - ${infoText(item)}`);
  }
  if (report.corrections.length > 0) {
    lines.push('The forward migration moves these service accounts to their recorded-day department (audited):');
    for (const item of report.corrections) {
      lines.push(
        `  - ${item.assignmentId}: ${item.fromDepartment} -> ${item.toDepartment} (recorded ${item.recordedOn})`,
      );
    }
  }
  if (report.companyCostCentersRemoved.length > 0) {
    lines.push(
      'The merged migration deletes these COMPANY Cost Centers and the COMPANY kind; only the backup keeps them:',
      ...report.companyCostCentersRemoved.map((center) => `  - ${center.code} (${center.status})`),
    );
  }

  return `${lines.join('\n')}\n`;
}

function infoText(item: PreflightInformation): string {
  switch (item.code) {
    case 'BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE':
      return `budget proposal ${item.proposalId} (${item.rule})`;
    case 'SERVICE_ACCOUNT_STILL_IN_FORCE':
      return `assignment ${item.assignmentId}`;
  }
}

function rowText(blocker: PreflightBlocker): string {
  switch (blocker.code) {
    case 'MIGRATION_FAILED':
      return `migration ${blocker.migration}`;
    case 'COST_ALLOCATION_NAMES_COMPANY':
      return `allocation version ${blocker.versionId} (version ${blocker.version}) names ${blocker.costCenter}`;
    case 'DEPARTMENT_CHARGED_TO_COMPANY':
      return `department ${blocker.department} charged to ${blocker.costCenter}`;
    case 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START':
      return `assignment ${blocker.assignmentId} of ${blocker.employeeCode}, started ${blocker.validFrom}`;
    case 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY':
      return `assignment ${blocker.assignmentId} of ${blocker.employeeCode}, recorded ${blocker.recordedOn}`;
    case 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED':
    case 'SUBSCRIPTION_OWNER_UNASSIGNED':
      return `subscription ${blocker.subscriptionId}`;
    case 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL':
      return 'the subscriptions table has only one of the owner-department column and the assignment table';
    case 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED':
    case 'COST_CENTER_DIRECTION_NOT_ACTIVATED':
      return `organization ${blocker.organizationId}`;
    case 'COST_CENTER_UNLINKED':
      return `cost center ${blocker.costCenterId}`;
    case 'COST_CENTER_LINK_MISMATCH':
      return `cost center ${blocker.costCenterId} belongs to another department than ${blocker.departmentId}, whose column names it`;
    case 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL':
      return 'the cost centers have only some of the department link column and its two tables';
    case 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING':
      return `notice ${blocker.noticeId}`;
    case 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING':
      return `transfer ${blocker.transferId}`;
    case 'SERVICE_ACCOUNT_MOVE_PENDING':
      return `service account move ${blocker.moveId}`;
    case 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT':
    case 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD':
      return `employee ${blocker.employeeCode}, department ${blocker.department}`;
    case 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE':
      return `employee ${blocker.employeeCode} also holds ${blocker.role}`;
    case 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT':
      return `employee ${blocker.employeeCode}`;
    case 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS':
      return `budget proposal ${blocker.proposalId} (versions ${blocker.versionIds.join(', ')}; decisions ${blocker.decisionIds.join(', ')}; related ${blocker.relatedProposalIds.join(', ') || 'none'})`;
  }
}
