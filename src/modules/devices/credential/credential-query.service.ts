import { Injectable } from '@nestjs/common';
import { CredentialRegistrationNotFoundError } from './credential.errors';
import { toCredentialSummary } from './credential.mapper';
import { CredentialRepo } from './credential.repo';

/** What the IT Admin reads of the credentials of a registration: which profile or collector has connected, and which are revoked. */
@Injectable()
export class CredentialQueryService {
  constructor(private readonly repo: CredentialRepo) {}

  /** Throws CredentialRegistrationNotFoundError. */
  async listOfRegistration(registrationId: string, input: { page: number; pageSize: number }) {
    if (!(await this.repo.registrationExists(registrationId))) throw new CredentialRegistrationNotFoundError();
    const { rows, total } = await this.repo.pageOfRegistration(
      registrationId,
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );

    return {
      items: rows.map(toCredentialSummary),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
