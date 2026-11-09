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
  HolderChangeBodyDto,
  RetirementBodyDto,
} from './registry.dto';
import { REGISTRY_ERROR_EXAMPLES as EXAMPLES, toRegistryApiException } from './registry.http-errors';
import { RegistryQueryService } from './registry-query.service';
import { RegistryService } from './registry.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin keeps the register of machines.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
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
  @ApiOperation({ operationId: 'deviceCreate', summary: 'Register a company machine to a holder' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.REGISTERED',
    description: 'The machine and its registration to the holder, waiting for the holder to acknowledge the notice.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The holder has left or is handing over (DEVICE.HOLDER_NOT_WORKING), the asset code is taken (DEVICE.ASSET_CODE_TAKEN), or the machine has a registration over those days (DEVICE.REGISTRATION_OVERLAP).',
      examples: [EXAMPLES.HOLDER_NOT_WORKING, EXAMPLES.ASSET_CODE_TAKEN, EXAMPLES.REGISTRATION_OVERLAP],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the holder does not exist (DEVICE.HOLDER_NOT_FOUND) or the handover day is not between the hire date and today (DEVICE.HANDOVER_DATE_INVALID).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.HOLDER_NOT_FOUND, EXAMPLES.HANDOVER_DATE_INVALID],
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
      'A page of machines ordered by asset code, each with its holder and the state of collection; filter by holder, by state or by a search on the asset code and the hostname.',
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

  @Post(':id/holder-changes')
  @ApiOperation({ operationId: 'deviceHolderChange', summary: 'Give a company machine to another holder' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.HOLDER_CHANGED',
    description:
      'The open registration ends today and a new one begins for the new holder, who has to acknowledge the notice. A machine nobody holds is registered again.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The machine is retired (DEVICE.ALREADY_RETIRED), the person already holds it (DEVICE.HOLDER_UNCHANGED), the new holder has left or is handing over (DEVICE.HOLDER_NOT_WORKING), or a registration over those days exists (DEVICE.REGISTRATION_OVERLAP).',
      examples: [
        EXAMPLES.ALREADY_RETIRED,
        EXAMPLES.HOLDER_UNCHANGED,
        EXAMPLES.HOLDER_NOT_WORKING,
        EXAMPLES.REGISTRATION_OVERLAP,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the new holder does not exist (DEVICE.HOLDER_NOT_FOUND).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.HOLDER_NOT_FOUND],
    },
  )
  async changeHolder(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: HolderChangeBodyDto,
  ) {
    try {
      await this.registry.changeHolder(actor, params.id, body.holderEmployeeId);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }

  @Post(':id/retirements')
  @ApiOperation({ operationId: 'deviceRetire', summary: 'Take a company machine out of use' })
  @ApiSuccessResponse(DeviceDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEVICE.RETIRED',
    description: 'The open registration ends and the machine stays in the register as retired, with the reason.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    DEVICE_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The machine is retired already (DEVICE.ALREADY_RETIRED).',
      examples: [EXAMPLES.ALREADY_RETIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async retire(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DeviceIdParamDto,
    @Body() body: RetirementBodyDto,
  ) {
    try {
      await this.registry.retire(actor, params.id, body.reason);

      return await this.queries.get(params.id);
    } catch (error) {
      throw toRegistryApiException(error);
    }
  }
}
