import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestReadAccessService } from '../request-view/request-read-access.service';
import type { RequestEventWire } from './request-history.dto';
import { LINE_SUBJECT_KEYS, REQUEST_EVENT_ACTIONS, entryOf } from './request-events.policy';
import { RequestHistoryRepo } from './request-history.repo';

const unique = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

/**
 * The history of one request (`accessRequestEventList`): the allow-listed events of the trail about the request and its steps, oldest
 * first, for the people who read the request (`canReadRequest`); a person who reads a request for a group only as one of its people
 * sees the entries about the whole request and about themselves, never those about another person. It is a filtered view of the
 * request, not the Audit Trail, which stays with the Super Admin.
 */
@Injectable()
export class RequestEventsService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly readAccess: RequestReadAccessService,
    private readonly repo: RequestHistoryRepo,
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Throws AccessRequestNotFoundError when the request does not exist or the caller may not read it. */
  async page(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<RequestEventWire>> {
    const record = await this.requests.findById(requestId);
    const access =
      record &&
      (await this.readAccess.accessOf(actor, {
        ...viewFactsOf(record),
        id: record.id,
        isGroup: record.type === 'GROUP_GRANT',
        departmentId: record.departmentId,
      }));
    if (!record || !access?.read) throw new AccessRequestNotFoundError();

    const resources = [
      { type: 'ACCESS_REQUEST', id: record.id },
      ...(await this.repo.stepIdsOf(record.id)).map((id) => ({ type: 'ACCESS_REQUEST_STEP', id })),
    ];
    const { rows, total } = await this.runner.run((tx) =>
      this.audit.pageOfResources(tx, resources, {
        actions: Object.keys(REQUEST_EVENT_ACTIONS),
        onlySubject: access.onlyLineOf === null ? null : { keys: LINE_SUBJECT_KEYS, subject: access.onlyLineOf },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    );
    const entries = rows.map((row) => ({ row, entry: entryOf(row) }));
    const { accounts, personOf } = await this.peopleOf(
      rows.map((row) => row.actorAppUserId),
      entries.map(({ entry }) => entry?.lineEmployeeId ?? null),
    );

    return pageOf(
      entries.flatMap(({ row, entry }) =>
        entry === null
          ? []
          : [
              {
                id: row.id,
                occurredAt: row.occurredAt.toISOString(),
                kind: entry.kind,
                actor: personOf(row.actorAppUserId && accounts.get(row.actorAppUserId)),
                actorKind: row.actorAppUserId === null ? ('SYSTEM' as const) : ('USER' as const),
                actorRole: entry.actorRole,
                line: personOf(entry.lineEmployeeId),
                reason: entry.reason,
              },
            ],
      ),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The employees behind the accounts that acted and the people of the lines, read once for the page. */
  private async peopleOf(accountIds: readonly (string | null)[], employeeIds: readonly (string | null)[]) {
    const accounts = await this.identity.employeeIdsOfAccounts(unique(accountIds));
    const found = await this.organizationReads.getEmployees(unique([...accounts.values(), ...employeeIds]));
    const people = new Map(
      found.map((person) => [
        person.id,
        { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
      ]),
    );
    const personOf = (id: string | null | undefined) => (id ? (people.get(id) ?? null) : null);

    return { accounts, personOf };
  }
}
