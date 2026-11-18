import { INestApplication } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { EmployeeImportPreviewService } from '../../../src/modules/data-import/employee-import/preview/employee-import-preview.service';
import { readUploadedEmployeeFile } from '../../../src/modules/data-import/employee-import/preview/employee-import-xlsx.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';

const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
let app: INestApplication<App>;
beforeAll(async () => {
  const upload = async (_actor: unknown, file: { fileName: string; mimeType?: string; bytes: Buffer }) => {
    const { rows } = await readUploadedEmployeeFile(file);
    return {
      id,
      fileName: file.fileName,
      status: 'PREVIEW',
      previewVersion: 1,
      ignoredColumns: [],
      summary: {
        totalRows: rows.length,
        valid: rows.length,
        errors: 0,
        existingSame: 0,
        existingDifferent: 0,
        newUnplaced: 0,
        newPeopleByDepartment: [],
        departmentsWithoutHead: [],
        reviewQueue: { total: 0, items: [] },
        duplicateOf: null,
      },
      result: null,
      createdAt: new Date(),
      expiresAt: new Date(),
      confirmedAt: null,
      cancelledAt: null,
    };
  };
  app = await createHttpContractApp({ overrides: [{ token: EmployeeImportPreviewService, useValue: { upload } }] });
});
afterAll(async () => app.close());
const auth = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

describe('employee Excel upload HTTP', () => {
  it('accepts a valid XLSX', async () => {
    const bytes = await readFile(resolve('docs/examples/employee-import/employee-template.xlsx'));
    const response = await request(app.getHttpServer())
      .post('/api/v1/employee-imports')
      .set(auth())
      .attach('file', bytes, 'employee-template.xlsx')
      .expect(201);
    expect(bodyOf(response).data).toMatchObject({ summary: { totalRows: 1 } });
  });
  it('rejects XLS', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/employee-imports')
      .set(auth())
      .attach('file', Buffer.from('bad'), 'old.xls')
      .expect(422);
    expect(bodyOf(response).error.code).toBe('IMPORT.FILE_FORMAT_UNSUPPORTED');
  });
});
