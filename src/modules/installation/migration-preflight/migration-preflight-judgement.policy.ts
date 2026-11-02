import {
  ContractGateFacts,
  ConversionFacts,
  DirectRoleFacts,
  FORWARD_MIGRATION,
  MigrationRecord,
  PreflightBlocker,
  PreflightCorrection,
  PreflightHistory,
  PreflightInformation,
  PreflightReport,
  UNIT_ONLY_MIGRATION,
} from '../public/migration-preflight.types';

/** Where a database stands: an attempt rolled back (by `migrate resolve --rolled-back`) counts as not applied. */
export function historyOf(applied: readonly MigrationRecord[] | null): PreflightHistory {
  if (applied === null) return 'NOT_INSTALLED';
  const state = (name: string): 'APPLIED' | 'FAILED' | 'ABSENT' => {
    const rows = applied.filter((row) => row.name === name && !row.rolledBack);
    if (rows.some((row) => row.finished)) return 'APPLIED';

    return rows.length > 0 ? 'FAILED' : 'ABSENT';
  };
  const unitOnly = state(UNIT_ONLY_MIGRATION);
  if (unitOnly === 'FAILED') return 'UNIT_ONLY_FAILED';
  if (unitOnly === 'ABSENT') return 'BEFORE_UNIT_ONLY';
  const forward = state(FORWARD_MIGRATION);
  if (forward === 'FAILED') return 'FORWARD_FAILED';

  return forward === 'APPLIED' ? 'CONVERGED' : 'UNIT_ONLY_APPLIED';
}

/**
 * What `migrate deploy` would do to the data, judged before it runs. Before the merged migration (or after its failed
 * attempt, which left the old schema): that migration owns a service account by the department on its start day and
 * stops when there is none, and cannot delete a COMPANY Cost Center that a department or a recorded allocation still
 * names. Either side of it, the forward migration owns it by the department on its recorded day and stops when there is
 * none (`QĐ-86c`). A converged database has nothing left to convert.
 */
export function judgeConversion(history: PreflightHistory, facts: ConversionFacts): PreflightReport {
  const blockers: PreflightBlocker[] = [];
  const corrections: PreflightCorrection[] = [];
  const legacy = history === 'BEFORE_UNIT_ONLY' || history === 'UNIT_ONLY_FAILED';
  const converting = legacy || history === 'UNIT_ONLY_APPLIED' || history === 'FORWARD_FAILED';

  if (history === 'UNIT_ONLY_FAILED') blockers.push({ code: 'MIGRATION_FAILED', migration: UNIT_ONLY_MIGRATION });
  if (history === 'FORWARD_FAILED') blockers.push({ code: 'MIGRATION_FAILED', migration: FORWARD_MIGRATION });

  if (converting) {
    if (legacy) {
      for (const line of facts.companyAllocations) blockers.push({ code: 'COST_ALLOCATION_NAMES_COMPANY', ...line });
      for (const row of facts.companyDepartments) blockers.push({ code: 'DEPARTMENT_CHARGED_TO_COMPANY', ...row });
    }
    for (const account of facts.serviceAccounts) {
      const { assignmentId, employeeCode, validFrom, recordedOn } = account;
      const current = legacy ? account.startDepartment : account.storedDepartment;
      if (legacy && current === null) {
        blockers.push({ code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START', assignmentId, employeeCode, validFrom });
      }
      if (account.recordedDepartment === null) {
        blockers.push({
          code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
          assignmentId,
          employeeCode,
          recordedOn,
        });
      } else if (current !== null && current !== account.recordedDepartment) {
        corrections.push({
          assignmentId,
          recordedOn,
          fromDepartment: current,
          toDepartment: account.recordedDepartment,
        });
      }
    }
  }

  return {
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    history,
    blockers: blockers.sort(byCodeThenRow),
    corrections: corrections.sort((a, b) => compare(a.assignmentId, b.assignmentId)),
    companyCostCentersRemoved: legacy ? [...facts.companyCostCenters].sort((a, b) => compare(a.code, b.code)) : [],
    information: [],
  };
}

/**
 * The contract gates, judged beside the conversion, as the FINAL release reads them: the
 * expansion and the data an operator records are prerequisites of its migrations, so each one that is not met blocks.
 * Subscription owner department: a database before the expansion migration that holds a subscription
 * blocks (deploy the compatibility release and assign first); after it, a subscription with no owner department and no
 * valid assignment blocks, whatever created it (the operator, a recovered old image, a late row), because the migration
 * of this release would refuse to run over it.
 */
export function judgeContractGates(facts: ContractGateFacts): {
  blockers: PreflightBlocker[];
  information: PreflightInformation[];
} {
  const owner = judgeSubscriptionOwner(facts.subscriptionOwner);
  const direction = judgeCostCenterDirection(facts.costCenterDirection);
  const returns = judgeLegacyReturns(facts.legacyReturns);

  return {
    blockers: [...owner.blockers, ...direction.blockers, ...judgeRetiredKinds(facts.retiredKinds), ...returns.blockers],
    information: [...owner.information, ...direction.information, ...returns.information],
  };
}

/**
 * The proposals `7c28e75` gave back because their first version was refused. A proposal given back with no refusal on
 * its versions was given back by Finance and is left alone. One whose refusal matches the return exactly (`traced`) is reconciled by the
 * migration of this release: R1 when nothing was sent after the return, R2 when exactly one proposal sends it again and every
 * proposal sent after the return belongs to the chain of that one; both are information. Every other case (a refusal that does not match,
 * several refusals, a proposal sent after the return that does not point back at it, two resubmissions) blocks, and nothing is guessed.
 */
export function judgeLegacyReturns(facts: ContractGateFacts['legacyReturns']): {
  blockers: PreflightBlocker[];
  information: PreflightInformation[];
} {
  const blockers: PreflightBlocker[] = [];
  const information: PreflightInformation[] = [];
  for (const candidate of [...facts.candidates].sort((a, b) => compare(a.proposalId, b.proposalId))) {
    const around = facts.neighbours.filter((row) => row.proposalId === candidate.proposalId);
    const later = around.filter((row) => row.submittedAfter);
    const resending = around.filter((row) => row.previousProposalId === candidate.proposalId);
    const rule = candidate.traced ? ruleOf(candidate.proposalId, later, resending) : null;
    if (rule === null) {
      blockers.push({
        code: 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS',
        proposalId: candidate.proposalId,
        versionIds: [...candidate.versionIds].sort(compare),
        decisionIds: [...candidate.decisionIds].sort(compare),
        relatedProposalIds: [...new Set(around.map((row) => row.id))].sort(compare),
      });
    } else {
      information.push({ code: 'BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE', proposalId: candidate.proposalId, rule });
    }
  }

  return { blockers, information };
}

type Neighbour = ContractGateFacts['legacyReturns']['neighbours'][number];

function ruleOf(proposalId: string, later: Neighbour[], resending: Neighbour[]): 'R1' | 'R2' | null {
  if (later.length === 0) return resending.length === 0 ? 'R1' : null;
  if (resending.length !== 1) return null;
  // The chain that starts at the one proposal that sends it again: every proposal sent after the return must be in it.
  const chain = new Set<string>([resending[0].id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of later) {
      if (!chain.has(row.id) && row.previousProposalId !== null && chain.has(row.previousProposalId)) {
        chain.add(row.id);
        grew = true;
      }
    }
  }

  return later.every((row) => chain.has(row.id)) && proposalId !== resending[0].id ? 'R2' : null;
}

/**
 * A notice of a change of job title, a transfer of the job title only and a proposal to move a service account are not taken any
 * more (`QĐ-87e`, `QĐ-89c`). One that still waits blocks, whatever the schema, because the migrations of this
 * release refuse to run over it: it is rejected or cancelled on the running release with the fixed reasons, never converted into
 * something it was not. Ids only. After those migrations the tables or the rows are gone, and nothing is read or listed.
 */
function judgeRetiredKinds(facts: ContractGateFacts['retiredKinds']): PreflightBlocker[] {
  return [
    ...[...facts.pendingNoticeIds]
      .sort(compare)
      .map((noticeId): PreflightBlocker => ({ code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING', noticeId })),
    ...[...facts.pendingTransferIds]
      .sort(compare)
      .map((transferId): PreflightBlocker => ({ code: 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING', transferId })),
    ...[...facts.pendingMoveIds]
      .sort(compare)
      .map((moveId): PreflightBlocker => ({ code: 'SERVICE_ACCOUNT_MOVE_PENDING', moveId })),
  ];
}

function judgeSubscriptionOwner(facts: ContractGateFacts['subscriptionOwner']): {
  blockers: PreflightBlocker[];
  information: PreflightInformation[];
} {
  const { schema, subscriptionIds } = facts;
  const ids = [...subscriptionIds].sort(compare);
  const blockers: PreflightBlocker[] = [];
  if (schema === 'ABSENT') {
    for (const subscriptionId of ids) blockers.push({ code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED', subscriptionId });
  } else if (schema === 'READY') {
    for (const subscriptionId of ids) blockers.push({ code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId });
  } else if (schema === 'PARTIAL') {
    blockers.push({ code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' });
  }

  return { blockers, information: [] };
}

/**
 * Every Cost Center belongs to one department (`QĐ-87d(1)`). A database before the compatibility migration
 * that holds an organization blocks (deploy the compatibility release first). On the compatibility schema a Cost Center with
 * no department blocks — whoever created it, a recovered old image included — and so does a department whose own column
 * contradicts the link, and an organization whose link the operator has not activated (the migration of this release raises
 * for the same three). On the final schema none of the three is read: the facts arrive empty.
 */
function judgeCostCenterDirection(facts: ContractGateFacts['costCenterDirection']): {
  blockers: PreflightBlocker[];
  information: PreflightInformation[];
} {
  const blockers: PreflightBlocker[] = [];
  if (facts.schema === 'ABSENT') {
    for (const organizationId of [...facts.organizationIds].sort(compare)) {
      blockers.push({ code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId });
    }
  } else if (facts.schema === 'READY') {
    for (const costCenterId of [...facts.costCenterIds].sort(compare)) {
      blockers.push({ code: 'COST_CENTER_UNLINKED', costCenterId });
    }
    for (const mismatch of [...facts.mismatches].sort((a, b) => compare(a.costCenterId, b.costCenterId))) {
      blockers.push({ code: 'COST_CENTER_LINK_MISMATCH', ...mismatch });
    }
    for (const organizationId of [...facts.notActivated].sort(compare)) {
      blockers.push({ code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId });
    }
  } else if (facts.schema === 'PARTIAL') {
    blockers.push({ code: 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL' });
  }

  return { blockers, information: [] };
}

/**
 * `MANAGER` and `SPENDING_APPROVER` become granted roles (`QĐ-93k(4)`, `…_identity_direct_roles`). The migration stops and lists
 * the same four kinds of row, and fixes none of them: Super Admin gives the head an account, ends the double role or hands the
 * spending approver over in the running release, before the deploy. One blocker for each row, the person by employee code.
 */
export function judgeDirectRoles(facts: DirectRoleFacts): PreflightBlocker[] {
  return [
    ...facts.headsWithoutAccount.map((row): PreflightBlocker => ({
      code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT',
      ...row,
    })),
    ...facts.spendingApproverHeads.map((row): PreflightBlocker => ({
      code: 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD',
      ...row,
    })),
    ...facts.spendingApproverHoldsRoles.map((row): PreflightBlocker => ({
      code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE',
      ...row,
    })),
    ...facts.spendingApproverWithoutAccount.map((row): PreflightBlocker => ({
      code: 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT',
      ...row,
    })),
  ].sort(byCodeThenRow);
}

/** The conversion report with the gates added: blocked as soon as one gate blocks. */
export function withContractGates(
  report: PreflightReport,
  gates: { blockers: PreflightBlocker[]; information: PreflightInformation[] },
): PreflightReport {
  const blockers = [...report.blockers, ...gates.blockers].sort(byCodeThenRow);

  return {
    ...report,
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers,
    information: [...report.information, ...gates.information],
  };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Blockers by code, then by the row they name, so a report reads the same on every run. */
function byCodeThenRow(a: PreflightBlocker, b: PreflightBlocker): number {
  return compare(a.code, b.code) || compare(rowOf(a), rowOf(b));
}

function rowOf(blocker: PreflightBlocker): string {
  switch (blocker.code) {
    case 'MIGRATION_FAILED':
      return blocker.migration;
    case 'COST_ALLOCATION_NAMES_COMPANY':
      return `${blocker.versionId} ${blocker.costCenter}`;
    case 'DEPARTMENT_CHARGED_TO_COMPANY':
      return blocker.department;
    case 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED':
    case 'SUBSCRIPTION_OWNER_UNASSIGNED':
      return blocker.subscriptionId;
    case 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED':
    case 'COST_CENTER_DIRECTION_NOT_ACTIVATED':
      return blocker.organizationId;
    case 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL':
    case 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL':
      return '';
    case 'COST_CENTER_UNLINKED':
      return blocker.costCenterId;
    case 'COST_CENTER_LINK_MISMATCH':
      return `${blocker.costCenterId} ${blocker.departmentId}`;
    case 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING':
      return blocker.noticeId;
    case 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING':
      return blocker.transferId;
    case 'SERVICE_ACCOUNT_MOVE_PENDING':
      return blocker.moveId;
    case 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS':
      return blocker.proposalId;
    case 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT':
    case 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD':
      return `${blocker.employeeCode} ${blocker.department}`;
    case 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE':
      return `${blocker.employeeCode} ${blocker.role}`;
    case 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT':
      return blocker.employeeCode;
    default:
      return blocker.assignmentId;
  }
}
