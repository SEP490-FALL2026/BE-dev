import { Injectable } from '@nestjs/common';
import type { DepartmentServiceAccountReader } from '../organization.types';

/** No reader of service accounts has been registered, so a department could be retired with one still open: a configuration error. */
export class ServiceAccountReaderNotRegisteredError extends Error {
  constructor() {
    super('No module has registered the reader of the service accounts a department owns.');
    this.name = 'ServiceAccountReaderNotRegisteredError';
  }
}

/**
 * Where `licensing` hands the organization its reader of the service accounts a department owns (`QĐ-86c`) when its
 * module starts: retiring a department asks here, and with no reader registered it fails loudly instead of passing.
 */
@Injectable()
export class DepartmentServiceAccountRegistry {
  private reader: DepartmentServiceAccountReader | null = null;

  register(reader: DepartmentServiceAccountReader): void {
    this.reader = reader;
  }

  current(): DepartmentServiceAccountReader {
    if (!this.reader) throw new ServiceAccountReaderNotRegisteredError();

    return this.reader;
  }
}
