import { as, listAll, summarize, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDepartment, DemoDepartmentSoftware, DemoSoftwareProposal } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface ProposalRow {
  proposalId: string;
  reason: string;
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

function departmentOf(ctx: DemoRunContext, code: string): DemoDepartment {
  const found = ctx.fixture.departments.find((candidate) => candidate.code === code);
  if (!found) throw new Error(`The software list names a department the fixture does not declare: ${code}`);

  return found;
}

/** The IT Admin in charge of the department: the one person who writes its list and decides the proposals of its head (P16, P18). */
function itAdminOf(ctx: DemoRunContext, code: string): string {
  const admin = departmentOf(ctx, code).itAdmin;
  if (!admin) throw new Error(`The department ${code} has no IT Admin to write its software list`);

  return admin;
}

/**
 * The list of a department is the dataset's once it holds any entry: entries the IT Admin added or took out since are theirs, and a rerun
 * never puts back what they removed. An empty list gets every place of the fixture in one call.
 */
async function oneList(ctx: DemoRunContext, list: DemoDepartmentSoftware): Promise<Result> {
  const label = `${list.department}: ${list.items.length} mục`;
  const departmentId = ctx.ids.departments.get(list.department);
  if (!departmentId) return { status: 'conflict', label: `${list.department}: phòng chưa có` };
  const admin = await as(ctx, itAdminOf(ctx, list.department));
  const existing = await listAll<{ entryId: string }>(ctx, admin, `/departments/${departmentId}/software-list`);
  if (existing.length > 0) return { status: 'present', label: `${list.department}: ${existing.length} mục` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(admin, 'POST', `/departments/${departmentId}/software-list/changes`, {
    add: list.items.map((item) => ({
      applicationId: ctx.ids.applications.get(item.application),
      ...(item.plan ? { planId: ctx.ids.plans.get(item.plan) } : {}),
      ...(item.note ? { note: item.note } : {}),
    })),
  });

  return { status: 'done', label };
}

async function lists(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const list of ctx.fixture.departmentSoftware) results.push(await oneList(ctx, list));

  return summarize(results);
}

/**
 * A proposal of the head, found by the dataset's tag at the start of its reason, then brought to the fixture's outcome: left waiting, or
 * rejected by the IT Admin in charge with a reason (`QĐ-110t`). One the IT Admin accepted since is theirs and reported, never changed.
 */
async function oneProposal(ctx: DemoRunContext, proposal: DemoSoftwareProposal): Promise<Result> {
  const label = `${proposal.key} ${proposal.department} → ${proposal.outcome}`;
  const department = departmentOf(ctx, proposal.department);
  const departmentId = ctx.ids.departments.get(proposal.department);
  if (!departmentId || !department.head) return { status: 'conflict', label: `${label}: phòng chưa có trưởng phòng` };
  const admin = await as(ctx, itAdminOf(ctx, proposal.department));
  const marker = tag(ctx, proposal.key);
  const rows = await listAll<ProposalRow>(ctx, admin, `/department-software-proposals?departmentId=${departmentId}`);
  let found = rows.find((row) => row.reason.startsWith(marker));
  let moved = false;
  if (!found) {
    if (ctx.mode === 'plan') return { status: 'planned', label };
    const head = await as(ctx, department.head);
    found = (
      await ctx.api.call<{ proposal: ProposalRow }>(head, 'POST', '/department-software-proposals', {
        applicationId: ctx.ids.applications.get(proposal.application),
        ...(proposal.plan ? { planId: ctx.ids.plans.get(proposal.plan) } : {}),
        reason: `${marker} ${proposal.reason}`,
      })
    ).proposal;
    moved = true;
  }
  if (found.state === proposal.outcome) return { status: moved ? 'done' : 'present', label };
  if (found.state !== 'PENDING' || proposal.outcome !== 'REJECTED' || !proposal.rejectionReason)
    return { status: 'conflict', label: `${label}: đang ${found.state}` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(admin, 'POST', `/department-software-proposals/${found.proposalId}/rejection`, {
    reason: `${marker} ${proposal.rejectionReason}`,
  });

  return { status: 'done', label };
}

async function proposals(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const proposal of ctx.fixture.softwareProposals) results.push(await oneProposal(ctx, proposal));

  return summarize(results);
}

export const SOFTWARE_LIST_STEPS: readonly DemoStep[] = [
  {
    key: 'software.lists',
    title: 'Danh sách phần mềm của phòng (IT Admin phụ trách phòng)',
    needs: ['catalog.plans', 'org.it-admins'],
    run: lists,
  },
  {
    key: 'software.proposals',
    title: 'Đề xuất thêm vào danh sách: một chờ, một bị từ chối có lý do (trưởng phòng, IT Admin)',
    needs: ['software.lists', 'org.heads'],
    run: proposals,
  },
];
