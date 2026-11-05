import { Body, Controller, Get, Header, Headers, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { DeviceAuthenticated } from '../../../../infrastructure/security/decorators/device-authenticated.decorator';
import { CurrentDevice, type CurrentDeviceCredential } from '../../../../infrastructure/security/models/current-device';
import { CREDENTIAL_ERROR_EXAMPLES as EXAMPLES, toCredentialApiException } from '../credential.http-errors';
import { DeviceSessionResponseDto, IssuedCredentialResponseDto, RotationBodyDto } from './credential-session.dto';
import { CredentialSessionService } from './credential-session.service';

const DEVICE_AUTH_ERRORS = {
  status: HttpStatus.UNAUTHORIZED,
  description:
    'The credential is missing or not valid (DEVICE.CREDENTIAL_INVALID), was revoked (DEVICE.CREDENTIAL_REVOKED) or has expired (DEVICE.CREDENTIAL_EXPIRED).',
  examples: [EXAMPLES.CREDENTIAL_INVALID, EXAMPLES.CREDENTIAL_REVOKED, EXAMPLES.CREDENTIAL_EXPIRED],
} as const;

/** What a collector reads of its own credential, and the rotation of its secret: a person's token is refused here. */
@ApiTags('device-session')
@Controller({ path: 'device-session', version: '1' })
@DeviceAuthenticated()
export class DeviceSessionController {
  constructor(private readonly sessions: CredentialSessionService) {}

  @Get()
  @ApiOperation({ operationId: 'deviceSessionGet', summary: 'Read the session of a collector credential' })
  @ApiSuccessResponse(DeviceSessionResponseDto, {
    message: 'DEVICE_SESSION.FETCHED',
    description:
      'Whether the machine is collected from, when the credential expires, the time zone of the organization and the window of data the server accepts.',
  })
  @ApiErrorResponses(DEVICE_AUTH_ERRORS, GUARDED_SERVICE_UNAVAILABLE_RESPONSE)
  async get(@CurrentDevice() device: CurrentDeviceCredential) {
    try {
      const session = await this.sessions.session(device.credentialId);

      return {
        state: session.state,
        expiresAt: session.expiresAt.toISOString(),
        timezone: session.timezone,
        acceptFromAt: session.acceptFromAt ? session.acceptFromAt.toISOString() : null,
        acceptUntilAt: session.acceptUntilAt ? session.acceptUntilAt.toISOString() : null,
        allowlist: session.allowlist,
      };
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }

  @Post('rotations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'deviceSessionRotationCreate', summary: 'Rotate the secret of a collector credential' })
  @ApiSuccessResponse(IssuedCredentialResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_SESSION.ROTATED',
    description:
      'A new token for the same credential, valid for another ninety days. The old secret works for a day more, until the new one is used.',
  })
  @ApiErrorResponses(DEVICE_AUTH_ERRORS, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The request is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async rotate(
    @CurrentDevice() device: CurrentDeviceCredential,
    @Body() _body: RotationBodyDto,
    @Headers('authorization') authorization: string | undefined,
  ) {
    try {
      const issued = await this.sessions.rotate(device.credentialId, authorization);

      return { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
    } catch (error) {
      throw toCredentialApiException(error);
    }
  }
}
