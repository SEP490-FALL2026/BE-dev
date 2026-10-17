import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AddNonWorkingDateBodyDto,
  ListNonWorkingDatesQueryDto,
  NonWorkingDateListResponseDto,
  NonWorkingDateParamDto,
  NonWorkingDateResponseDto,
  ParameterHistoryResponseDto,
  ParameterKeyParamDto,
  ParameterListResponseDto,
  ParameterResponseDto,
  RenameNonWorkingDateBodyDto,
  SetParameterBodyDto,
} from './dto/operating-parameters.dto';
import { NonWorkingDatesService } from './non-working-dates.service';
import { toOperatingParametersApiException } from './operating-parameters.http-errors';
import { OperatingParametersService, ParameterView } from './operating-parameters.service';

const AUTH_ERRORS = [
  { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required or the token is no longer valid.' },
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin configures the operating parameters (AC-6).' },
  {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
  },
] as const;
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
} as const;

function toWire(view: ParameterView) {
  return {
    key: view.key,
    value: view.value,
    default: view.default,
    isDefault: view.isDefault,
    unit: view.unit,
    description: view.description,
    constraints: view.constraints as unknown as Record<string, unknown>,
    changedAt: view.changedAt ? view.changedAt.toISOString() : null,
  };
}

/**
 * The operating parameters (`US-01-04`): thresholds, deadlines and schedules the Super Admin sets without touching
 * code. Nothing changes the time zone of the organization: it is chosen once at installation (AC-11), and there is
 * no route for it.
 */
@ApiTags('operating-parameters')
@Controller({ version: '1' })
export class OperatingParametersController {
  constructor(
    private readonly parameters: OperatingParametersService,
    private readonly nonWorkingDates: NonWorkingDatesService,
  ) {}

  @Get('operating-parameters')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterList' })
  @ApiSuccessResponse(ParameterListResponseDto, {
    message: 'PARAMETER.LISTED',
    description: 'Every parameter with the value in force, its default, its unit and the domain a value must stay in.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async list() {
    try {
      return { items: (await this.parameters.list()).map(toWire) };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Put('operating-parameters/:key')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterSet' })
  @ApiSuccessResponse(ParameterResponseDto, {
    message: 'PARAMETER.SET',
    description:
      'The value applies to what is created from now on; what already runs keeps the value it was created with. The same value again changes nothing.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'There is no such parameter (PARAMETER.NOT_FOUND).',
  })
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ParameterKeyParamDto,
    @Body() body: SetParameterBodyDto,
  ) {
    try {
      return toWire(await this.parameters.set(actor, params.key, body.value));
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Get('operating-parameters/:key/history')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterHistory' })
  @ApiSuccessResponse(ParameterHistoryResponseDto, {
    message: 'PARAMETER.HISTORY_LISTED',
    description: 'The values the parameter has had, newest first.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'There is no such parameter (PARAMETER.NOT_FOUND).',
  })
  async history(@Param() params: ParameterKeyParamDto) {
    try {
      return {
        items: (await this.parameters.history(params.key)).map((entry) => ({
          value: entry.value,
          from: entry.from.toISOString(),
          until: entry.until ? entry.until.toISOString() : null,
        })),
      };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Get('non-working-dates')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateList' })
  @ApiSuccessResponse(NonWorkingDateListResponseDto, {
    message: 'NON_WORKING_DATE.LISTED',
    description: 'The days nobody works, in date order, optionally between two dates.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR)
  async listNonWorkingDates(@Query() query: ListNonWorkingDatesQueryDto) {
    try {
      return { items: await this.nonWorkingDates.list(query) };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Post('non-working-dates')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateAdd' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    status: HttpStatus.CREATED,
    message: 'NON_WORKING_DATE.ADDED',
    description: 'The day is a non-working date from now on. Today or a later day only.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.CONFLICT,
    description: 'The day is already a non-working date (NON_WORKING_DATE.TAKEN).',
  })
  async addNonWorkingDate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: AddNonWorkingDateBodyDto) {
    try {
      return await this.nonWorkingDates.add(actor, body);
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Patch('non-working-dates/:date')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateRename' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    message: 'NON_WORKING_DATE.RENAMED',
    description: 'The reason of a non-working date changes. A day before today is refused (NON_WORKING_DATE.IN_PAST).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'The day is not a non-working date (NON_WORKING_DATE.NOT_FOUND).',
  })
  async renameNonWorkingDate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NonWorkingDateParamDto,
    @Body() body: RenameNonWorkingDateBodyDto,
  ) {
    try {
      return await this.nonWorkingDates.rename(actor, params.date, body.reason);
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Delete('non-working-dates/:date')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateRemove' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    message: 'NON_WORKING_DATE.REMOVED',
    description: 'The day is a working day again. A day before today is refused (NON_WORKING_DATE.IN_PAST).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_ERROR, {
    status: HttpStatus.NOT_FOUND,
    description: 'The day is not a non-working date (NON_WORKING_DATE.NOT_FOUND).',
  })
  async removeNonWorkingDate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NonWorkingDateParamDto,
  ) {
    try {
      return await this.nonWorkingDates.remove(actor, params.date);
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }
}
