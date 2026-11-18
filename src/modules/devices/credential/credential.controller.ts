import { Body, Controller, Get, Header, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  CredentialIdParamDto,
  EnrollmentCodeBodyDto,
  EnrollmentCodeResponseDto,
  RegistrationIdParamDto,
  CredentialListQueryDto,
  CredentialPageResponseDto,
  CredentialRevocationBodyDto,
  CredentialSummaryResponseDto,
} from './credential.dto';
import { CREDENTIAL_ERROR_EXAMPLES as EXAMPLES, toCredentialApiException } from './credential.http-errors';
import { toCredentialSummary } from './credential.mapper';
import { CredentialQueryService } from './credential-query.service';
import { CredentialRevocationService } from './credential-revocation.service';
import { CredentialEnrollmentService } from './enrollment/credential-enrollment.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin makes enrollment codes and takes credentials away.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const IT_ADMIN_READS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin reads the credentials of a machine.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/** The IT Admin's side of the credentials of a machine: the code for the installer, who has connected, and the way to cut one off. */
@ApiTags('device-credentials')
@Controller({ version: '1' })
@RequireRoles('IT_ADMIN')
export class CredentialController {
  constructor(
    private readonly enrollments: CredentialEnrollmentService,
    private readonly queries: CredentialQueryService,
    private readonly revocations: CredentialRevocationService,
  ) {}

  @Post('device-registrations/:id/enrollment-codes')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'deviceEnrollmentCodeCreate', summary: 'Make an enrollment code for a registration' })
  @ApiSuccessResponse(EnrollmentCodeResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ENROLLMENT_CODE.CREATED',
    description:
      'A code for the person who installs the collector, good for a day. It is shown this once; an AI collector takes one use, a browser extension up to five.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The registration does not exist (DEVICE_REGISTRATION.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The registration has ended (DEVICE_REGISTRATION.ENDED) or its signed notice is not kept yet (DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING).',
      examples: [EXAMPLES.REGISTRATION_ENDED, EXAMPLES.SIGNATURE_RECORD_MISSING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async createCode(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RegistrationIdParamDto,
    @Body() body: EnrollmentCodeBodyDto,
  ) {
    try {
      const code = await this.enrollments.createCode(actor, params.id, body);

      return {
        code: code.code,
        collectorKind: code.collectorKind,
        maxUses: code.maxUses,
        expiresAt: code.expiresAt.toISOString(),
      };
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }

  @Get('device-registrations/:id/credentials')
  @ApiOperation({ operationId: 'deviceCredentialList', summary: 'List the credentials of a registration' })
  @ApiSuccessResponse(CredentialPageResponseDto, {
    message: 'DEVICE_CREDENTIAL.LISTED',
    description:
      'The credentials issued for the registration, newest first: which collector has connected and when it last sent data.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_READS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The registration does not exist (DEVICE_REGISTRATION.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Param() params: RegistrationIdParamDto, @Query() query: CredentialListQueryDto) {
    try {
      return await this.queries.listOfRegistration(params.id, query);
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }

  @Post('device-credentials/:id/revocations')
  @ApiOperation({ operationId: 'deviceCredentialRevocationCreate', summary: 'Revoke a collector credential' })
  @ApiSuccessResponse(CredentialSummaryResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_CREDENTIAL.REVOKED',
    description: 'The credential is revoked at once, with the reason; the collector is told so on its next request.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The credential does not exist (DEVICE_CREDENTIAL.NOT_FOUND).',
      examples: [EXAMPLES.CREDENTIAL_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The credential is revoked already (DEVICE_CREDENTIAL.ALREADY_REVOKED).',
      examples: [EXAMPLES.ALREADY_REVOKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async revoke(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CredentialIdParamDto,
    @Body() body: CredentialRevocationBodyDto,
  ) {
    try {
      return toCredentialSummary(await this.revocations.revokeByIt(actor, params.id, body.reason));
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }
}
