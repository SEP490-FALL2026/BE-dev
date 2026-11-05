import { Body, Controller, Header, Headers, HttpStatus, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ApiErrorResponses,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { VALIDATION_ERROR_BODY } from '../../../../infrastructure/http/pipes/zod-validation.pipe';
import { Public } from '../../../../infrastructure/security/decorators/public.decorator';
import { CREDENTIAL_ERROR_EXAMPLES as EXAMPLES, toCredentialApiException } from '../credential.http-errors';
import { EnrolledCredentialResponseDto, EnrollmentBodyDto, idempotencyKeySchema } from './credential-enrollment.dto';
import { CredentialEnrollmentService } from './credential-enrollment.service';

/**
 * Where a collector exchanges the code it was given for a credential. Public: the collector has no credential yet, and the code
 * is the proof; it is throttled hard and every refusal of the code is the same answer.
 */
@ApiTags('device-enrollments')
@Controller({ path: 'device-enrollments', version: '1' })
export class DeviceEnrollmentController {
  constructor(private readonly enrollments: CredentialEnrollmentService) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'A key the tool makes once per install (16 to 128 letters, digits, - or _); sending it again gets the credential again.',
  })
  @ApiOperation({ operationId: 'deviceEnrollmentCreate', summary: 'Exchange an enrollment code for a credential' })
  @ApiSuccessResponse(EnrolledCredentialResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_ENROLLMENT.COMPLETED',
    description:
      'The token of the new credential and when it expires. The token is shown this once; only its hash is kept.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The code cannot be used: unknown, expired, used up, or its registration is no longer open (DEVICE_ENROLLMENT.CODE_INVALID).',
      examples: [EXAMPLES.CODE_INVALID],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body or the Idempotency-Key is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async create(@Body() body: EnrollmentBodyDto, @Headers('idempotency-key') idempotencyKey: string | undefined) {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
        ...VALIDATION_ERROR_BODY,
        details: { issues: [{ code: 'invalid_format', path: 'Idempotency-Key' }] },
      });
    }
    try {
      const issued = await this.enrollments.enroll({ enrollmentCode: body.enrollmentCode, idempotencyKey: key.data });

      return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }
}
