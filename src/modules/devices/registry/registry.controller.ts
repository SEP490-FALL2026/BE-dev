import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
  DeviceCreateBodyDto,
  DeviceDetailResponseDto,
  DeviceIdParamDto,
  DeviceListQueryDto,
  DevicePageResponseDto,
  DeviceRegistrationListQueryDto,
  DeviceRegistrationPageResponseDto,
} from './registry.dto';
import { REGISTRY_ERROR_EXAMPLES as EXAMPLES, toRegistryApiException } from './registry.http-errors';
import { RegistryQueryService } from './registry-query.service';
import { RegistryService } from './registry.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ADMIN_READS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin reads the register of machines.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const DEVICE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The machine is not in the register (DEVICE.NOT_FOUND).',
  examples: [EXAMPLES.DEVICE_NOT_FOUND],
} as const;

/** The register of company machines used by one person each: the IT Admin registers, hands over and retires them. */
@ApiTags('devices')
@Controller({ path: 'devices', version: '1' })
@RequireRoles('IT_ADMIN')
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly queries: RegistryQueryService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'deviceCreate', summary: 'Register a company machine' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.REGISTERED',
    description: 'The machine with a generated asset code, placed in stock or registered to the initial holder.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin registers a machine; handing over to an initial holder requires an acting IT Admin of their department (DEVICE.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_IN_CHARGE],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The holder has not started working in a department yet (EMPLOYEE.NOT_STARTED), has not been placed in a department yet (DEVICE.HOLDER_UNPLACED), has left or is handing over (DEVICE.HOLDER_NOT_WORKING), the serial number is used by another machine (DEVICE.SERIAL_TAKEN), the asset code counter is exhausted (DEVICE.ASSET_CODE_EXHAUSTED), the generated asset code collided (DEVICE.ASSET_CODE_TAKEN), or the machine has an overlapping registration (DEVICE.REGISTRATION_OVERLAP).',
      examples: [
        EXAMPLES.EMPLOYEE_NOT_STARTED,
        EXAMPLES.HOLDER_UNPLACED,
        EXAMPLES.HOLDER_NOT_WORKING,
        EXAMPLES.SERIAL_TAKEN,
        EXAMPLES.ASSET_CODE_EXHAUSTED,
        EXAMPLES.ASSET_CODE_TAKEN,
        EXAMPLES.REGISTRATION_OVERLAP,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), handover fields were given without a holder (DEVICE.HANDOVER_WITHOUT_HOLDER), a bundled plan is invalid (DEVICE_ACTIVATION.PLAN_NOT_BUNDLED), the holder does not exist (DEVICE.HOLDER_NOT_FOUND) or the handover day is not between the hire date and today (DEVICE.HANDOVER_DATE_INVALID).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.HANDOVER_WITHOUT_HOLDER,
        EXAMPLES.PLAN_NOT_BUNDLED,
        EXAMPLES.HOLDER_NOT_FOUND,
        EXAMPLES.HANDOVER_DATE_INVALID,
      ],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DeviceCreateBodyDto) {
    try {
      return await this.queries.get(await this.registry.create(actor, body));
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }

  @Get()
  @ApiOperation({ operationId: 'deviceList', summary: 'List the company machines' })
  @ApiSuccessResponse(DevicePageResponseDto, {
    message: 'DEVICE.LISTED',
    description:
      'A page of machines ordered by asset code, each with its holder, the state of collection and the last time an intake from it was accepted; filter by holder, by state or by a search on the asset code and the hostname.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ADMIN_READS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: DeviceListQueryDto) {
    try {
      return await this.queries.list(query);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }

  @Get(':id/registrations')
  @ApiOperation({ operationId: 'deviceRegistrationList', summary: 'List who held a company machine' })
  @ApiSuccessResponse(DeviceRegistrationPageResponseDto, {
    message: 'DEVICE_REGISTRATION.LISTED',
    description:
      'A page of the registrations of the machine, the newest first (the open one, then the ones that ended): the holder, the days, how each ended, whether it was signed and acknowledged, and the last time an intake was accepted.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ADMIN_READS, DEVICE_NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or the query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async registrations(@Param() params: DeviceIdParamDto, @Query() query: DeviceRegistrationListQueryDto) {
    try {
      return await this.queries.registrations(params.id, query);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'deviceGet', summary: 'Get a company machine' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    message: 'DEVICE.FETCHED',
    description:
      'The machine with its holder, the state of collection, the latest acknowledgement and signed record, and how its last registration ended.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ADMIN_READS, DEVICE_NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@Param() params: DeviceIdParamDto) {
    try {
      return await this.queries.get(params.id);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }
}
