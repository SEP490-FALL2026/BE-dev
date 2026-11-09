import type { ProfileNotice } from '../public/organization.types';

/** What the notices of a created or corrected employee record are made from: who it is about and who answers for the department. */
export interface ProfileNoticeFacts {
  kind: 'CREATED' | 'UPDATED';
  organizationId: string;
  employee: { id: string; working: boolean };
  /** The department the person is in; null when they are in none that day. */
  departmentId: string | null;
  /** Who heads it and who is IT Admin in charge of it that day, when anybody does. */
  headEmployeeId: string | null;
  itAdminEmployeeId: string | null;
  /** Tells one correction from another: the key of the notice carries it. */
  eventId: string;
}

/**
 * The notices an employee record owes (`QĐ-87b(3)`, `US-02-02` AC-17): a new record tells the head of the department and the
 * IT Admin in charge, who prepare the grants; a corrected one tells the employee, while they work, and their head. Nobody is told
 * twice and a department with nobody in a role tells nobody in it. Ids only: no name, no value that changed.
 */
export function profileNoticesOf(facts: ProfileNoticeFacts): ProfileNotice[] {
  const code = facts.kind === 'CREATED' ? 'EMPLOYEE_PROFILE_CREATED' : 'EMPLOYEE_PROFILE_UPDATED';
  const recipients =
    facts.kind === 'CREATED'
      ? [facts.headEmployeeId, facts.itAdminEmployeeId]
      : [facts.employee.working ? facts.employee.id : null, facts.headEmployeeId];
  const unique = [...new Set(recipients.filter((id): id is string => id !== null))];

  return unique.map((recipientEmployeeId) => ({
    organizationId: facts.organizationId,
    recipientEmployeeId,
    code,
    subject: { type: 'EMPLOYEE', id: facts.employee.id },
    params: { employeeId: facts.employee.id, departmentId: facts.departmentId },
    eventKey: `${code.toLowerCase()}:${facts.employee.id}:${facts.eventId}`,
  }));
}
