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
import { PERSONNEL_ACCESS_ERROR_EXAMPLES } from '../personnel-access.http-errors';
import { userActor } from '../public/personnel.types';
import {
  CancelTransferBodyDto,
  ListTransferChangesQueryDto,
  ListTransfersQueryDto,
  RecordTransferBodyDto,
  RescheduleTransferBodyDto,
  TransferChangePageResponseDto,
  TransferDetailResponseDto,
  TransferIdParamDto,
  TransferPageResponseDto,
  TransferRecordedResponseDto,
} from './transfer.dto';
import { TRANSFER_ERROR_EXAMPLES as EXAMPLES, toTransferApiException } from './transfer.http-errors';
import { TransferChangeService } from './transfer-change.service';
import { TransferQueryService } from './transfer-query.service';
import { TransferService } from './transfer.service';

const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** A write by the Super Admin is also refused about themselves: the controlled procedure records that event. */
const FORBIDDEN_WRITE = {
  ...FORBIDDEN,
  description: `${FORBIDDEN.description} The Super Admin does not record or change a transfer about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.`,
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const WRITE_COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN_WRITE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The transfer does not exist, or an IT Admin reads one of a department they are not in charge of (DEPARTMENT_TRANSFER.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/** The refusals of the basis of a change, the same on every write that needs one. */
const GROUNDS_EXAMPLES = [EXAMPLES.GROUNDS_IS_NOTICE] as const;
/** The refusals of a change of a transfer that waits: it took effect or was cancelled, or the head or the placements were changed meanwhile. */
const SETTLED_EXAMPLES = [EXAMPLES.ALREADY_EFFECTIVE, EXAMPLES.ALREADY_CANCELLED, EXAMPLES.CONCURRENT_CHANGE] as const;
/** The refusals of the day of a change. */
const DAY_EXAMPLES = [
  EXAMPLES.NO_CHANGE,
  EXAMPLES.EFFECTIVE_DATE_IN_PAST,
  EXAMPLES.EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD,
] as const;

const GROUNDS_REFUSALS =
  'the basis (groundsNote) is only the code of a notice and not a document (DEPARTMENT_TRANSFER.GROUNDS_IS_NOTICE); a basis that is missing, blank or over 500 characters is a VALIDATION_ERROR';

/**
 * Transfers of a person to another department with the day they take effect and the basis they rest on. The Super Admin records,
 * moves and cancels them (`QĐ-87a`); the IT Admin reads a minimal projection of the departments in their charge. Nobody closes a
 * transfer by hand: the system closes it once every right of the old department is taken back (`QĐ-110r`). Finance, a department head
 * and an employee are refused. The role is judged again by the service, so this guard is only the outer layer.
 */
@ApiTags('department-transfers')
@Controller({ path: 'department-transfers', version: '1' })
export class TransfersController {
  constructor(
    private readonly transfers: TransferService,
    private readonly changes: TransferChangeService,
    private readonly query: TransferQueryService,
  ) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferRecord', summary: 'Record a transfer of a person' })
  @ApiSuccessResponse(TransferRecordedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DEPARTMENT_TRANSFER.RECORDED',
    description:
      'The transfer was recorded: the placement the person has ends on the day and the new one begins on it, and the head of the department they leave is handed over or left empty as chosen. A day of today takes effect at once. The seats the person holds are not touched.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (DEPARTMENT_TRANSFER.EMPLOYEE_NOT_FOUND).',
      examples: [EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person has left (DEPARTMENT_TRANSFER.EMPLOYEE_LEFT) or has another event waiting (PENDING_EVENT_EXISTS: details.kind is TRANSFER for a transfer that waits, HEAD_HANDOVER, OFFBOARDING, or TRANSFER_SETTLING for a transfer before that took effect and is not closed yet), the destination department cannot take people (DEPARTMENT_INACTIVE; a department with no Cost Center takes people like any other), or the placements cannot take it (PLACEMENT_OVERLAP, CONCURRENT_CHANGE).',
      examples: [
        EXAMPLES.EMPLOYEE_LEFT,
        EXAMPLES.PENDING_EVENT_EXISTS,
        EXAMPLES.DEPARTMENT_INACTIVE,
        EXAMPLES.PLACEMENT_OVERLAP,
        EXAMPLES.CONCURRENT_CHANGE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is in the past or not after the first day of the current placement (DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST, EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD), the department does not change (NO_CHANGE), the department is unknown (DEPARTMENT_NOT_FOUND), the destination takes effect later than the day (DEPARTMENT_NOT_YET_EFFECTIVE), ${GROUNDS_REFUSALS}, or the head of the department they leave is not provided for (PERSONNEL.SUCCESSOR_REQUIRED: a head who is moved names an employee to follow them, "nobody" is refused; DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE).`,
      examples: [
        VALIDATION_EXAMPLE,
        ...DAY_EXAMPLES,
        EXAMPLES.DEPARTMENT_NOT_FOUND,
        EXAMPLES.DEPARTMENT_NOT_YET_EFFECTIVE,
        ...GROUNDS_EXAMPLES,
        PERSONNEL_ACCESS_ERROR_EXAMPLES.SUCCESSOR_REQUIRED,
        EXAMPLES.SUCCESSOR_NOT_A_MEMBER_ON_DATE,
      ],
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordTransferBodyDto) {
    try {
      return await this.query.recordedOf(await this.transfers.record(userActor(actor), body));
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferList', summary: 'List transfers of people' })
  @ApiSuccessResponse(TransferPageResponseDto, {
    message: 'DEPARTMENT_TRANSFER.LISTED',
    description:
      'A page of transfers, the latest day first, optionally of one person, one state or a range of days. Each row says who, what changes, from where to where, the day and where it stands; the basis and the head handover are in the detail. An IT Admin reads only the transfers that leave or enter a department they are in charge of.',
  })
  @ApiErrorResponses(...COMMON, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListTransfersQueryDto) {
    try {
      return await this.query.list(actor, query);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferGet', summary: 'Read a transfer' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.RETRIEVED',
    description:
      'The transfer with its basis, who follows the head of the old department, who recorded it (an account, or the controlled procedure) and how it ended. The IT Admin reads a minimal projection: no basis, no head handover and no reason of a cancellation.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TransferIdParamDto) {
    try {
      return await this.query.get(actor, params.id);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Get(':id/changes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferChangeList', summary: 'List the moves of a transfer' })
  @ApiSuccessResponse(TransferChangePageResponseDto, {
    message: 'DEPARTMENT_TRANSFER.CHANGES_LISTED',
    description:
      'A page of the moves of the day and the cancellation of the transfer, oldest first, each with its reason and basis.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async listChanges(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferIdParamDto,
    @Query() query: ListTransferChangesQueryDto,
  ) {
    try {
      return await this.query.listChanges(actor, params.id, query);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Post(':id/rescheduling')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferReschedule', summary: 'Move the day of a waiting transfer' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.RESCHEDULED',
    description:
      'The day of the transfer moved: the placement the person has now lasts to the day before the new one, and the handover of the head moved with it. A reason and a basis are required, and only a transfer that has not taken effect can move.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer has taken effect (DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE) or was cancelled (ALREADY_CANCELLED), or the head or the placements changed meanwhile (CONCURRENT_CHANGE).',
      examples: [...SETTLED_EXAMPLES, EXAMPLES.DEPARTMENT_INACTIVE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid, such as one without a reason or a basis (VALIDATION_ERROR), ${GROUNDS_REFUSALS}, the day is the same, in the past or not after the current placement (NO_CHANGE, EFFECTIVE_DATE_IN_PAST, EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD), or the head of the department cannot be handed over on the new day (PERSONNEL.SUCCESSOR_REQUIRED, DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved.`,
      examples: [
        VALIDATION_EXAMPLE,
        ...GROUNDS_EXAMPLES,
        ...DAY_EXAMPLES,
        PERSONNEL_ACCESS_ERROR_EXAMPLES.SUCCESSOR_REQUIRED,
        EXAMPLES.SUCCESSOR_NOT_A_MEMBER_ON_DATE,
      ],
    },
  )
  async reschedule(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferIdParamDto,
    @Body() body: RescheduleTransferBodyDto,
  ) {
    try {
      const record = await this.changes.reschedule(userActor(actor), params.id, body);

      return await this.query.detailOf(record);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }

  @Post(':id/cancellation')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'departmentTransferCancel', summary: 'Cancel a waiting transfer' })
  @ApiSuccessResponse(TransferDetailResponseDto, {
    message: 'DEPARTMENT_TRANSFER.CANCELLED',
    description:
      'The transfer was cancelled: the person keeps the department, and the head of the department stays head. A reason and a basis are required, and only a transfer that has not taken effect can be cancelled.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The transfer has taken effect (DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE) or was cancelled already (ALREADY_CANCELLED), or the head or the placements changed meanwhile (CONCURRENT_CHANGE).',
      examples: [...SETTLED_EXAMPLES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid, such as one without a reason or a basis (VALIDATION_ERROR), or ${GROUNDS_REFUSALS}.`,
      examples: [VALIDATION_EXAMPLE, ...GROUNDS_EXAMPLES],
    },
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferIdParamDto,
    @Body() body: CancelTransferBodyDto,
  ) {
    try {
      const record = await this.changes.cancel(userActor(actor), params.id, body);

      return await this.query.detailOf(record);
    } catch (error) {
      throw toTransferApiException(error);
    }
  }
}
