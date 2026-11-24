import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
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
import { ACTIVATION_ERROR_EXAMPLES } from '../activation/activation.http-errors';
import { DeviceDetailResponseDto } from '../registry/registry.dto';
import { REGISTRY_ERROR_EXAMPLES } from '../registry/registry.http-errors';
import { RegistryQueryService } from '../registry/registry-query.service';
import { DeviceInitialRecordBodyDto } from './initial-record.dto';
import { INITIAL_RECORD_ERROR_EXAMPLES, toInitialRecordApiException } from './initial-record.http-errors';
import { InitialRecordService } from './initial-record.service';

const INITIAL_RECORD_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only an IT Admin records initial machines; handing over to an initial holder requires an acting IT Admin of their department (DEVICE.NOT_IN_CHARGE).',
    examples: [FORBIDDEN_EXAMPLE, REGISTRY_ERROR_EXAMPLES.NOT_IN_CHARGE],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The initialization phase is closed (DEVICE.INITIALIZATION_CLOSED), a conflict occurred on the holder, serial number, asset code, registration, or an initial activation could not be opened on the lot or key.',
    examples: [
      INITIAL_RECORD_ERROR_EXAMPLES.INITIALIZATION_CLOSED,
      REGISTRY_ERROR_EXAMPLES.ASSET_CODE_EXHAUSTED,
      REGISTRY_ERROR_EXAMPLES.ASSET_CODE_TAKEN,
      REGISTRY_ERROR_EXAMPLES.HOLDER_NOT_WORKING,
      REGISTRY_ERROR_EXAMPLES.REGISTRATION_OVERLAP,
      REGISTRY_ERROR_EXAMPLES.SERIAL_TAKEN,
      ACTIVATION_ERROR_EXAMPLES.ALREADY_ON_DEVICE,
      ACTIVATION_ERROR_EXAMPLES.KEY_WITHDRAWN,
      ACTIVATION_ERROR_EXAMPLES.LOT_FULL,
      ACTIVATION_ERROR_EXAMPLES.PURCHASE_NOT_ACTIVE,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR), the legacy asset code is invalid (DEVICE.ASSET_CODE_INVALID), handover fields were given without a holder, the holder or handover date is invalid, or an activation target/key is invalid.',
    examples: [
      VALIDATION_EXAMPLE,
      INITIAL_RECORD_ERROR_EXAMPLES.ASSET_CODE_INVALID,
      REGISTRY_ERROR_EXAMPLES.HANDOVER_DATE_INVALID,
      REGISTRY_ERROR_EXAMPLES.HANDOVER_WITHOUT_HOLDER,
      REGISTRY_ERROR_EXAMPLES.HOLDER_NOT_FOUND,
      ACTIVATION_ERROR_EXAMPLES.KEY_NOT_FOUND,
      REGISTRY_ERROR_EXAMPLES.PLAN_NOT_BUNDLED,
      ACTIVATION_ERROR_EXAMPLES.PLAN_NOT_DEVICE_BOUND,
      ACTIVATION_ERROR_EXAMPLES.PLAN_NOT_FOUND,
    ],
  },
] as const;

/** Records pre-existing company machines during the seat-baseline initialization phase (`W2-13`). */
@ApiTags('devices')
@Controller({ path: 'device-initial-records', version: '1' })
@RequireRoles('IT_ADMIN')
export class InitialRecordController {
  constructor(
    private readonly initialRecords: InitialRecordService,
    private readonly queries: RegistryQueryService,
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'deviceInitialRecordCreate',
    summary: 'Record an existing company machine during initialization',
  })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.INITIAL_RECORDED',
    description:
      'Records a pre-existing machine while the seat-baseline initialization phase is open, using a legacy asset code or generating one, with optional past handover (signatureMissing = true until BM-06 is recorded) and initial software activations (origin = INITIAL). Initial activations (origin = INITIAL) do NOT increment activationsUsed because initialActivationsUsed entered on the license key already accounts for pre-existing installations.',
  })
  @ApiErrorResponses(...INITIAL_RECORD_ERRORS)
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DeviceInitialRecordBodyDto) {
    try {
      return await this.queries.get(await this.initialRecords.create(actor, body));
    } catch (error) {
      throw toInitialRecordApiException(error);
    }
  }
}
