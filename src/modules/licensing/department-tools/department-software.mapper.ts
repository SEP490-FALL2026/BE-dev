import type { SoftwareEntryWire, SoftwareProposalWire } from './department-software.dto';
import type { SoftwareEntry, SoftwareProposal } from './department-software.types';

/** What the catalog and the organization call the things a place and a proposal name: only the words, never a price or a subscription. */
export interface SoftwareNames {
  applications: ReadonlyMap<string, string>;
  plans: ReadonlyMap<string, string>;
  people: ReadonlyMap<string, { employeeCode: string; fullName: string }>;
  departments: ReadonlyMap<string, { code: string; name: string }>;
}

/** A foreign key guarantees the names exist; one that does not is a fault of the data, not an answer. */
function named<T>(map: ReadonlyMap<string, T>, id: string, what: string): T {
  const found = map.get(id);
  if (found === undefined) throw new Error(`The ${what} ${id} of the software list is not known.`);

  return found;
}

export function toEntryWire(entry: SoftwareEntry, names: SoftwareNames): SoftwareEntryWire {
  return {
    entryId: entry.id,
    applicationId: entry.applicationId,
    applicationName: named(names.applications, entry.applicationId, 'application'),
    planId: entry.planId,
    planName: entry.planId === null ? null : named(names.plans, entry.planId, 'plan'),
    note: entry.note,
    addedAt: entry.addedAt.toISOString(),
  };
}

export function toProposalWire(proposal: SoftwareProposal, names: SoftwareNames): SoftwareProposalWire {
  const department = named(names.departments, proposal.departmentId, 'department');
  const proposer = named(names.people, proposal.proposedByEmployeeId, 'employee');

  return {
    proposalId: proposal.id,
    department: { id: proposal.departmentId, code: department.code, name: department.name },
    applicationId: proposal.applicationId,
    applicationName: named(names.applications, proposal.applicationId, 'application'),
    planId: proposal.planId,
    planName: proposal.planId === null ? null : named(names.plans, proposal.planId, 'plan'),
    reason: proposal.reason,
    state: proposal.state,
    proposedBy: {
      employeeId: proposal.proposedByEmployeeId,
      employeeCode: proposer.employeeCode,
      fullName: proposer.fullName,
    },
    proposedAt: proposal.proposedAt.toISOString(),
    decidedAt: proposal.decidedAt?.toISOString() ?? null,
    decisionReason: proposal.decisionReason,
  };
}
