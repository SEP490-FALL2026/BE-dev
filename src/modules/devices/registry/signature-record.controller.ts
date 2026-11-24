import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { CollectorInstallationService } from './collector-installation.service';
import {
  DeviceDetailResponseDto,
  DeviceIdParamDto,
  SignatureRecordBodyDto,
  SignatureRecordResponseDto,
} from './registry.dto';
import { REGISTRY_ERROR_EXAMPLES as EXAMPLES, toRegistryApiException } from './registry.http-errors';
import { RegistryQueryService } from './registry-query.service';
import { toSignatureRecord } from './registry.mapper';
import { SignatureRecordService } from './signature-record.service';

/** Registration evidence and collector setup endpoints on `/device-registrations`: signed `BM-06` and one-way collector enablement. */
@ApiTags('devices')
@Controller({ path: 'device-registrations', version: '1' })
export class SignatureRecordController {
  constructor(
    private readonly records: SignatureRecordService,
    private readonly collectorInstallation: CollectorInstallationService,
    private readonly queries: RegistryQueryService,
  ) {}

  @Post(':id/signature-records')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'deviceSignatureRecordCreate', summary: 'Record the signed notice of a registration' })
  @ApiSuccessResponse(SignatureRecordResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_SIGNATURE_RECORD.RECORDED',
    description:
      'The scan now belongs to the holder who signed it and is kept with the version of the notice it was signed under.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin records a signed notice.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The registration does not exist (DEVICE_REGISTRATION.NOT_FOUND) or the file is not one this IT Admin uploaded (DOCUMENT.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND, EXAMPLES.DOCUMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The registration has ended (DEVICE_REGISTRATION.ENDED), the file has an owner already (DOCUMENT.ALREADY_ATTACHED) or is not uploaded yet (DOCUMENT.NOT_READY_TO_ATTACH).',
      examples: [EXAMPLES.REGISTRATION_ENDED, EXAMPLES.DOCUMENT_ALREADY_ATTACHED, EXAMPLES.DOCUMENT_NOT_READY],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the version of the notice does not exist (DEVICE_SIGNATURE_RECORD.NOTICE_VERSION_NOT_FOUND) or the file is not a signed record (DOCUMENT.PURPOSE_MISMATCH).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NOTICE_VERSION_NOT_FOUND, EXAMPLES.DOCUMENT_PURPOSE_MISMATCH],
    },
  )
  async create(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: SignatureRecordBodyDto,
  ) {
    try {
      return toSignatureRecord(await this.records.record(actor, params.id, body));
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }

  @Post(':id/collector-installation')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'deviceRegistrationCollectorEnable',
    summary: 'Enable collector installation on an open registration',
  })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE_REGISTRATION.COLLECTOR_ENABLED',
    description: 'Marks the open registration as having a collector installed and returns the updated device detail.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an acting IT Admin of the holder department may enable collector installation (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The registration does not exist (DEVICE_REGISTRATION.NOT_FOUND).',
      examples: [EXAMPLES.REGISTRATION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The registration has ended (DEVICE_REGISTRATION.ENDED), collector installation is already enabled (DEVICE_REGISTRATION.COLLECTOR_ALREADY_INSTALLED), or the holder has left or is handing over (DEVICE.HOLDER_NOT_WORKING).',
      examples: [EXAMPLES.REGISTRATION_ENDED, EXAMPLES.COLLECTOR_ALREADY_INSTALLED, EXAMPLES.HOLDER_NOT_WORKING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async enableCollector(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: DeviceIdParamDto) {
    try {
      const deviceId = await this.collectorInstallation.enable(actor, params.id);

      return await this.queries.get(deviceId);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }
}
