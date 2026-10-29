import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  fallbackExample,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AddLinesBodyDto,
  IdParamDto,
  BudgetLineImportResponseDto,
  LineChangePageResponseDto,
  LineParamDto,
  LinePatchDto,
  LineResponseDto,
  PageQueryDto,
  VersionLinePageResponseDto,
  VersionResponseDto,
  WindowBodyDto,
} from '../budget.dto';
import { BudgetImportFileInvalidError } from '../budget.errors';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget.http-errors';
import { LineImportService } from './line-import.service';
import { VersionLineService } from './version-line.service';
import { VersionViewService } from '../version-view.service';

/** The largest file the route reads: a file of 1 000 lines is far smaller. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UPLOAD_LIMITS = { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 1 };
/** What the multipart parser answers before the handler runs; the filter gives both the code of their status. */
const UPLOAD_LIMIT_ERRORS = [
  {
    status: HttpStatus.BAD_REQUEST,
    description:
      `The form breaks a limit of the upload before it is read — more than ${UPLOAD_LIMITS.files} file, any text field, ` +
      `more than ${UPLOAD_LIMITS.parts} part — or it is not a readable multipart form (HTTP_BAD_REQUEST).`,
    examples: [fallbackExample(HttpStatus.BAD_REQUEST)],
  },
  {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: `The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MiB (HTTP_PAYLOAD_TOO_LARGE).`,
    examples: [fallbackExample(HttpStatus.PAYLOAD_TOO_LARGE)],
  },
] as const;

interface UploadedBinary {
  originalname: string;
  buffer: Buffer;
}

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FINANCE_ONLY_DESCRIPTION = 'Only Finance builds the versions of a budget.';
const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: FINANCE_ONLY_DESCRIPTION,
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** The reading routes have no role guard: the service lets Finance, the spending approver and the substitute read. */
const READERS_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: FINANCE_ONLY_DESCRIPTION,
  examples: [EXAMPLES.NOT_A_READER],
} as const;
const NOT_FOUND_DESCRIPTION =
  'The version or the line does not exist (BUDGET.VERSION_NOT_FOUND, BUDGET.LINE_NOT_FOUND).';
/** A route that reads a line by its position. */
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: NOT_FOUND_DESCRIPTION,
  examples: [EXAMPLES.VERSION_NOT_FOUND, EXAMPLES.LINE_NOT_FOUND],
} as const;
/** A route that reads the version only. */
const VERSION_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: NOT_FOUND_DESCRIPTION,
  examples: [EXAMPLES.VERSION_NOT_FOUND],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_EDITABLE = {
  status: HttpStatus.CONFLICT,
  description:
    'The version is not a draft nor sent back to Finance, or is a draft left behind by a proposal that was withdrawn or given back, so it is not changed (BUDGET.VERSION_NOT_EDITABLE).',
  examples: [EXAMPLES.VERSION_NOT_EDITABLE],
} as const;
/** What an amount of a line refuses after the request validation: its currency and its range. */
const MONEY_EXAMPLES = [
  EXAMPLES.CURRENCY_NOT_REPORTING,
  EXAMPLES.CURRENCY_NOT_SUPPORTED,
  EXAMPLES.MONEY_SCALE_EXCEEDED,
  EXAMPLES.MONEY_OUT_OF_RANGE,
] as const;

/**
 * The versions of a budget as Finance builds them (`US-06-09`): a first version from the proposal that waits, a revision of
 * the current budget, lines adjusted with a comment and a reason, a forecast by quarter that never limits a payment, a file
 * of lines, and the sending to the spending approver. Only Finance does this: the head, the IT Admin, the Super Admin and
 * the spending approver cannot, and nobody here makes a version current.
 */
@ApiTags('budget-versions')
@Controller({ path: 'budget-versions', version: '1' })
export class BudgetVersionLinesController {
  constructor(
    private readonly lineOps: VersionLineService,
    private readonly views: VersionViewService,
    private readonly imports: LineImportService,
  ) {}

  @Get(':id/lines')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionLineList', summary: 'List the lines of a version' })
  @ApiSuccessResponse(VersionLinePageResponseDto, {
    message: 'BUDGET_VERSION.LINES_LISTED',
    description: 'In order, with the position of the line of the proposal each adjusts.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, VERSION_NOT_FOUND, INVALID)
  async lines(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.views.lines(actor, params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Put(':id/lines/:position')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetVersionLineUpdate', summary: 'Comment on and adjust a line of a version' })
  @ApiSuccessResponse(LineResponseDto, {
    message: 'BUDGET_VERSION.LINE_CHANGED',
    description: 'The line of the proposal it comes from stays as it was; changing what it said needs the reason.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, NOT_FOUND, NOT_EDITABLE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), the window runs backwards (BUDGET.WINDOW_BACKWARDS), the reason of the adjustment is missing (BUDGET.ADJUSTMENT_REASON_REQUIRED), the line names a plan that does not exist (BUDGET.PLAN_NOT_FOUND) or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.WINDOW_BACKWARDS,
      EXAMPLES.ADJUSTMENT_REASON_REQUIRED,
      EXAMPLES.PLAN_NOT_FOUND,
      EXAMPLES.YEAR_ENDED,
      ...MONEY_EXAMPLES,
    ],
  })
  async updateLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LineParamDto,
    @Body() body: LinePatchDto,
  ) {
    try {
      return { line: await this.lineOps.updateLine(actor, params.id, params.position, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/lines')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetVersionLineAdd', summary: 'Add lines to a version being built' })
  @ApiSuccessResponse(VersionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_VERSION.LINES_ADDED',
    description: 'Lines of Finance own, saying what every line says.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, VERSION_NOT_FOUND, NOT_EDITABLE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), a line is incomplete (BUDGET.PROPOSAL_INCOMPLETE), a window runs backwards (BUDGET.WINDOW_BACKWARDS), a line names a plan that does not exist (BUDGET.PLAN_NOT_FOUND) or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.PROPOSAL_INCOMPLETE,
      EXAMPLES.WINDOW_BACKWARDS,
      EXAMPLES.PLAN_NOT_FOUND,
      EXAMPLES.YEAR_ENDED,
      ...MONEY_EXAMPLES,
    ],
  })
  async addLines(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: AddLinesBodyDto,
  ) {
    try {
      return { version: await this.lineOps.addLines(actor, params.id, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Put(':id/lines/:position/window')
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'budgetVersionLineWindow',
    summary: 'Move the purchase window of a line of the current budget',
  })
  @ApiSuccessResponse(LineResponseDto, {
    message: 'BUDGET_VERSION.WINDOW_MOVED',
    description: 'The move is kept with what the window was and the reason. An amount is never changed here.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The version is not the current budget (BUDGET.VERSION_NOT_CURRENT), or an amount is given: that is a revision (BUDGET.REVISION_REQUIRED).',
      examples: [EXAMPLES.VERSION_NOT_CURRENT, EXAMPLES.REVISION_REQUIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the reason is missing (BUDGET.WINDOW_REASON_REQUIRED), the window runs backwards (BUDGET.WINDOW_BACKWARDS) or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.WINDOW_REASON_REQUIRED,
        EXAMPLES.WINDOW_BACKWARDS,
        EXAMPLES.YEAR_ENDED,
        ...MONEY_EXAMPLES,
      ],
    },
  )
  async changeWindow(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LineParamDto,
    @Body() body: WindowBodyDto,
  ) {
    try {
      return { line: await this.lineOps.changeWindow(actor, params.id, params.position, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id/lines/:position/changes')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionLineChangeList', summary: 'List the moves of the window of a line' })
  @ApiSuccessResponse(LineChangePageResponseDto, {
    message: 'BUDGET_VERSION.CHANGES_LISTED',
    description: 'Newest first: the window before and after, the reason, who and when.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, NOT_FOUND, INVALID)
  async changes(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LineParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.views.changes(actor, params.id, params.position, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/imports')
  @RequireRoles('FINANCE')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ operationId: 'budgetVersionImport', summary: 'Load lines into a version from a file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiSuccessResponse(BudgetLineImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_VERSION.LINES_IMPORTED',
    description:
      'Each row is judged on its own: the right ones are added to the version, which is a draft and so budgets nothing until it is approved, and the others are reported with the row and the reason.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, ...UPLOAD_LIMIT_ERRORS, FINANCE_ONLY, VERSION_NOT_FOUND, NOT_EDITABLE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The file cannot be read as a table, lacks a column, or is empty (BUDGET.IMPORT_FILE_INVALID), or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.IMPORT_FILE_INVALID, EXAMPLES.YEAR_ENDED],
  })
  async load(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @UploadedFile() file: UploadedBinary | undefined,
  ) {
    try {
      if (!file) throw new BudgetImportFileInvalidError('EMPTY');

      return { result: await this.imports.load(actor, params.id, file.buffer.toString('utf8')) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
