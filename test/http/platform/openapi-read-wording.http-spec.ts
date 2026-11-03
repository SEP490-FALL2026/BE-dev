import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { createHttpContractApp } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

type Operation = {
  operationId?: string;
  responses?: Record<string, { description?: string }>;
};

/**
 * F03: the 403 and 422 of a read route say who can read and what can be invalid for a read. A route that only reads shared the
 * wording of the writes of its controller (a department list that says the IT Admin changes no department data, a project read that
 * says the projects are "kept"), so a client showed a refusal that was not true of the route it called. The text is the only thing
 * that differs: the status, the examples and the guards of every route are pinned elsewhere (the example manifest, the inventory).
 */

/** What only a write can say: the HR basis, a rule of a department or a cost center, a project that is not valid, who maintains. */
const WRITE_ONLY_WORDING = new RegExp(
  [
    'changes department data',
    'HR basis',
    'COST_CENTER\\.(?:KIND|NAME|DEPARTMENT)',
    'maintains the Cost Center',
    'among them an HR basis',
    '\\bOnly (?:Finance|the Super Admin|an IT Admin) (?:builds|configures|imports|keeps) ',
  ].join('|'),
);

/** The reads whose wording a client sees on a screen: the 403 (who may) and the 422 (what can be invalid), exactly. */
const READ_WORDING: Record<string, { '403'?: string; '422'?: string }> = {
  departmentList: {
    '403':
      'Only the Super Admin and the IT Admin list departments; the IT Admin sees only the departments they are in charge of or stand in for.',
    '422': 'The query is invalid (VALIDATION_ERROR).',
  },
  departmentGet: { '422': 'The id is not a UUID (VALIDATION_ERROR).' },
  departmentMemberList: { '422': 'The id or the query is invalid (VALIDATION_ERROR).' },
  departmentTechnicalMemberList: { '422': 'The id or the query is invalid (VALIDATION_ERROR).' },
  costCenterEmployeeList: {
    '403': 'Only Finance reads the people in a cost center (the IT Admin and the Super Admin do not).',
    '422': 'The id or the query is invalid (VALIDATION_ERROR).',
  },
  budgetVersionList: {
    '403': 'Only Finance and the spending approver read the versions of a budget.',
  },
  budgetVersionGet: {
    '403': 'Only Finance and the spending approver read the versions of a budget.',
  },
  budgetVersionLineList: {
    '403': 'Only Finance and the spending approver read the versions of a budget.',
  },
  budgetVersionLineChangeList: {
    '403': 'Only Finance and the spending approver read the versions of a budget.',
  },
  operatingParameterList: {
    '403': 'Only the Super Admin reads the operating parameters, their history and the non-working dates.',
  },
  operatingParameterHistory: {
    '403': 'Only the Super Admin reads the operating parameters, their history and the non-working dates.',
  },
  nonWorkingDateList: {
    '403': 'Only the Super Admin reads the operating parameters, their history and the non-working dates.',
  },
  employeeList: {
    '403': 'Only the Super Admin reads the company-wide employee directory.',
    '422': 'The query is invalid (VALIDATION_ERROR).',
  },
  employeeGet: {
    '403': 'Only the Super Admin reads the company-wide employee directory.',
    '422': 'The id is not a UUID (VALIDATION_ERROR).',
  },
  employeeImportGet: { '403': 'Only the Super Admin reads an employee import and its rows.' },
  employeeImportRowList: {
    '403': 'Only the Super Admin reads an employee import and its rows.',
    '422': 'The identifier is not a UUID, or the filter or paging query is invalid (VALIDATION_ERROR).',
  },
  seatBaselineImportGet: { '403': 'Only an IT Admin reads a seat baseline import and its rows.' },
  seatBaselineImportRows: {
    '403': 'Only an IT Admin reads a seat baseline import and its rows.',
    '422': 'The identifier is not a UUID, or the filter or paging query is invalid (VALIDATION_ERROR).',
  },
};

describe('what the document says of the refusals of a read route (F03)', () => {
  let app: INestApplication<App>;
  let reads: Map<string, Operation>;

  beforeAll(async () => {
    app = await createHttpContractApp();
    const document: OpenAPIObject = createOpenApiDocument(app);
    reads = new Map(
      Object.values(document.paths).flatMap((item) => {
        const operation = (item as { get?: Operation }).get;

        return operation?.operationId ? [[operation.operationId, operation] as const] : [];
      }),
    );
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app.close();
  });

  it('keeps what only a write can say out of the 403 and the 422 of every read route', () => {
    expect(reads.size).toBeGreaterThan(100);

    const offenders = [...reads].flatMap(([operationId, operation]) =>
      (['403', '422'] as const).flatMap((status) => {
        const description = operation.responses?.[status]?.description ?? '';

        return WRITE_ONLY_WORDING.test(description) ? [`${operationId} ${status}: ${description}`] : [];
      }),
    );

    expect(offenders).toEqual([]);
  });

  it.each(Object.entries(READ_WORDING))(
    'words the refusals of %s for a read, as the route answers',
    (operationId, wording) => {
      const responses = reads.get(operationId)?.responses ?? {};

      expect(
        Object.fromEntries(Object.keys(wording).map((status) => [status, responses[status]?.description])),
      ).toEqual(wording);
    },
  );
});
