import { DataImportService } from './data-import.service';
import type { EmployeeImportService } from './employee-import/employee-import.service';
import type { LatestImport } from './employee-import/employee-import.repo';

function facadeOver(latest: LatestImport | null): DataImportService {
  return new DataImportService({ latestImport: () => Promise.resolve(latest) } as unknown as EmployeeImportService);
}

describe('DataImportService, the public contract of data-import (H8.3, A4-10)', () => {
  const createdAt = new Date('2026-10-19T03:00:00.000Z');

  it.each(['PREVIEW', 'COMPLETED'] as const)(
    'answers a latest %s import with its id, status and wrong rows only',
    async (status) => {
      const answer = await facadeOver({ id: 'i1', status, errorRows: 2, createdAt }).latestEmployeeImport();

      expect(answer).toEqual({ id: 'i1', status, errorRows: 2 });
      expect(Object.keys(answer ?? {})).toEqual(['id', 'status', 'errorRows']);
    },
  );

  it('answers null before the first import', async () => {
    await expect(facadeOver(null).latestEmployeeImport()).resolves.toBeNull();
  });

  it('never answers a cancelled import, which its contract cannot express', async () => {
    await expect(
      facadeOver({ id: 'i1', status: 'CANCELLED', errorRows: 2, createdAt }).latestEmployeeImport(),
    ).resolves.toBeNull();
  });
});
