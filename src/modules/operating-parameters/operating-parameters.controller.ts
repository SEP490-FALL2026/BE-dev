import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../infrastructure/http/decorators/api-error-responses.decorator';
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
} from './operating-parameters.dto';
import { NonWorkingDatesService } from './non-working-dates.service';
import {
  OPERATING_PARAMETERS_ERROR_EXAMPLES,
  toOperatingParametersApiException,
} from './operating-parameters.http-errors';
import { ParameterChangeService } from './parameter-change.service';
import { OperatingParametersApi, ParameterView } from './public/operating-parameters.api';

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin configures the operating parameters.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
/** The three reads (the list, the history of a parameter, the non-working dates) are the Super Admin's, like the writes. */
const READ_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin reads the operating parameters, their history and the non-working dates.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const VALIDATION_ERROR_DESCRIPTION = 'The request is invalid (VALIDATION_ERROR).';
const VALIDATION_ERROR = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: VALIDATION_ERROR_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;
const PARAMETER_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'There is no such parameter (PARAMETER.NOT_FOUND).',
  examples: [OPERATING_PARAMETERS_ERROR_EXAMPLES.PARAMETER_NOT_FOUND],
} as const;
const NON_WORKING_DATE_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The day is not a non-working date (NON_WORKING_DATE.NOT_FOUND).',
  examples: [OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_NOT_FOUND],
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
    private readonly parameters: OperatingParametersApi,
    private readonly parameterChange: ParameterChangeService,
    private readonly nonWorkingDates: NonWorkingDatesService,
  ) {}

  @Get('operating-parameters')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterList', summary: 'List operating parameters' })
  @ApiSuccessResponse(ParameterListResponseDto, {
    message: 'PARAMETER.LISTED',
    description: 'Every parameter with the value in force, its default, its unit and the domain a value must stay in.',
  })
  @ApiErrorResponses(...READ_ERRORS)
  async list() {
    try {
      return { items: (await this.parameters.list()).map(toWire) };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Put('operating-parameters/:key')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterSet', summary: 'Set an operating parameter' })
  @ApiSuccessResponse(ParameterResponseDto, {
    message: 'PARAMETER.SET',
    description:
      'The value applies to what is created from now on; what already runs keeps the value it was created with. The same value again changes nothing.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: VALIDATION_ERROR_DESCRIPTION,
      examples: [VALIDATION_EXAMPLE, OPERATING_PARAMETERS_ERROR_EXAMPLES.PARAMETER_VALUE_INVALID],
    },
    PARAMETER_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The value is locked because something was already made under it: the month the fiscal year begins cannot change once a budget version exists (PARAMETER.LOCKED).',
      examples: [OPERATING_PARAMETERS_ERROR_EXAMPLES.PARAMETER_LOCKED],
    },
  )
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ParameterKeyParamDto,
    @Body() body: SetParameterBodyDto,
  ) {
    try {
      return toWire(await this.parameterChange.set(actor, params.key, body.value));
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Get('operating-parameters/:key/history')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'operatingParameterHistory', summary: 'Show the history of an operating parameter' })
  @ApiSuccessResponse(ParameterHistoryResponseDto, {
    message: 'PARAMETER.HISTORY_LISTED',
    description: 'The values the parameter has had, newest first.',
  })
  @ApiErrorResponses(...READ_ERRORS, VALIDATION_ERROR, PARAMETER_NOT_FOUND)
  async history(@Param() params: ParameterKeyParamDto) {
    try {
      const history = await this.parameters.history(params.key);

      return {
        items: history.items.map((entry) => ({
          value: entry.value,
          from: entry.from.toISOString(),
          until: entry.until ? entry.until.toISOString() : null,
        })),
        hasMore: history.hasMore,
      };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Get('non-working-dates')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateList', summary: 'List non-working dates' })
  @ApiSuccessResponse(NonWorkingDateListResponseDto, {
    message: 'NON_WORKING_DATE.LISTED',
    description:
      'One page of the days nobody works, in date order, optionally between two dates. The list is paged: without page and pageSize the answer holds the first 20 only. pagination.totalItems counts every matching day and pagination.totalPages the pages; ask for page 2 up to totalPages (pageSize up to 100) to read the rest.',
  })
  @ApiErrorResponses(...READ_ERRORS, VALIDATION_ERROR)
  async listNonWorkingDates(@Query() query: ListNonWorkingDatesQueryDto) {
    try {
      const page = await this.nonWorkingDates.list(query);

      return { items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Post('non-working-dates')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateAdd', summary: 'Add a non-working date' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    status: HttpStatus.CREATED,
    message: 'NON_WORKING_DATE.ADDED',
    description: 'The day is a non-working date from now on. Today or a later day only.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: VALIDATION_ERROR_DESCRIPTION,
      examples: [
        VALIDATION_EXAMPLE,
        OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_IN_PAST,
        OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_REASON_INVALID,
      ],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The day is already a non-working date (NON_WORKING_DATE.TAKEN).',
      examples: [OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_TAKEN],
    },
  )
  async addNonWorkingDate(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: AddNonWorkingDateBodyDto) {
    try {
      return await this.nonWorkingDates.add(actor, body);
    } catch (error) {
      throw toOperatingParametersApiException(error);
    }
  }

  @Patch('non-working-dates/:date')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'nonWorkingDateRename', summary: 'Rename a non-working date' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    message: 'NON_WORKING_DATE.RENAMED',
    description: 'The reason of a non-working date changes. A day before today is refused (NON_WORKING_DATE.IN_PAST).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: VALIDATION_ERROR_DESCRIPTION,
      examples: [
        VALIDATION_EXAMPLE,
        OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_IN_PAST,
        OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_REASON_INVALID,
      ],
    },
    NON_WORKING_DATE_NOT_FOUND,
  )
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
  @ApiOperation({ operationId: 'nonWorkingDateRemove', summary: 'Remove a non-working date' })
  @ApiSuccessResponse(NonWorkingDateResponseDto, {
    message: 'NON_WORKING_DATE.REMOVED',
    description: 'The day is a working day again. A day before today is refused (NON_WORKING_DATE.IN_PAST).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: VALIDATION_ERROR_DESCRIPTION,
      examples: [VALIDATION_EXAMPLE, OPERATING_PARAMETERS_ERROR_EXAMPLES.NON_WORKING_DATE_IN_PAST],
    },
    NON_WORKING_DATE_NOT_FOUND,
  )
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
