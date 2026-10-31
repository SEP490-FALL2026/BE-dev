import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  fallbackExample,
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
  ConfirmSeatImportBodyDto,
  ListSeatImportRowsQueryDto,
  SeatImportConfirmationResponseDto,
  SeatImportIdParamDto,
  SeatImportResponseDto,
  SeatImportRowsResponseDto,
  UploadSeatImportBodyDto,
} from './seat-baseline-import.dto';
import { SeatImportFileInvalidError } from './seat-baseline-import.errors';
import { SEAT_IMPORT_ERROR_EXAMPLES, toSeatImportApiException } from './seat-baseline-import.http-errors';
import { SeatBaselineImportService } from './seat-baseline-import.service';
import type { SeatImportView } from './seat-baseline-import.types';

/** The largest file the route reads: a seat file of 1 000 rows is far smaller. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** One file and nothing else of any size: a form of 50 fields, or a field of a megabyte, is refused before it is read (`SEC-06`). */
const UPLOAD_LIMITS = { fileSize: MAX_FILE_BYTES, files: 1, fields: 2, fieldSize: 64, parts: 3 };
/** What the multipart parser answers before the handler runs; the filter gives both the code of their status. */
const UPLOAD_LIMIT_ERRORS = [
  {
    status: HttpStatus.BAD_REQUEST,
    description:
      `The form breaks a limit of the upload before it is read — more than ${UPLOAD_LIMITS.files} file, more than ` +
      `${UPLOAD_LIMITS.fields} text fields, more than ${UPLOAD_LIMITS.parts} parts, a text field over ` +
      `${UPLOAD_LIMITS.fieldSize} bytes — or it is not a readable multipart form (HTTP_BAD_REQUEST).`,
    examples: [fallbackExample(HttpStatus.BAD_REQUEST)],
  },
  {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: `The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MiB (HTTP_PAYLOAD_TOO_LARGE).`,
    examples: [fallbackExample(HttpStatus.PAYLOAD_TOO_LARGE)],
  },
] as const;

/** The part of a multipart upload this controller uses; multer own type is not a dependency of the project. */
interface UploadedBinary {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin imports the seat baseline.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
/** Reading an import and its rows is the IT Admin's, as uploading and confirming it are. */
const READ_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin reads a seat baseline import and its rows.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The import does not exist (SEAT_BASELINE_IMPORT.NOT_FOUND).',
  examples: [SEAT_IMPORT_ERROR_EXAMPLES.NOT_FOUND],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The identifier is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The rows are read with a filter and paging as well, so the query can be what is wrong. */
const INVALID_ID_OR_QUERY = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The identifier is not a UUID, or the filter or paging query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

function toWire(view: SeatImportView) {
  return {
    id: view.id,
    fileName: view.fileName,
    status: view.status,
    previewVersion: view.previewVersion,
    target: view.target,
    ignoredColumns: view.ignoredColumns,
    summary: view.summary,
    result: view.result,
    createdAt: view.createdAt.toISOString(),
    expiresAt: view.expiresAt.toISOString(),
    confirmedAt: view.confirmedAt ? view.confirmedAt.toISOString() : null,
    cancelledAt: view.cancelledAt ? view.cancelledAt.toISOString() : null,
  };
}

/**
 * Importing the seat baseline of one subscription, or of one internal plan, from a file (`US-02-05`): upload → preview →
 * confirm. The IT Admin uploads a CSV file; nothing is written until the preview is confirmed, and then once. Finance,
 * Managers and the Super Admin do not import seats. Once the baseline is closed no import is taken (`AC-6`).
 */
@ApiTags('seat-baseline-imports')
@Controller({ path: 'seat-baseline-imports', version: '1' })
export class SeatBaselineImportsController {
  constructor(private readonly imports: SeatBaselineImportService) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ operationId: 'seatBaselineImportUpload', summary: 'Upload a seat baseline file for preview' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        subscriptionId: { type: 'string', format: 'uuid' },
        planId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiSuccessResponse(SeatImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SEAT_BASELINE_IMPORT.UPLOADED',
    description:
      'The file was read and every row judged against the seats and the people as they are: nothing is written yet. The summary says how many rows are valid, wrong and why, and the seats before and after.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    ...UPLOAD_LIMIT_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription or the plan does not exist (SUBSCRIPTION.NOT_FOUND, PLAN.NOT_FOUND).',
      examples: [SEAT_IMPORT_ERROR_EXAMPLES.SUBSCRIPTION_NOT_FOUND, SEAT_IMPORT_ERROR_EXAMPLES.PLAN_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The baseline is closed (SEAT_BASELINE.CLOSED), the subscription has no quantity (SEAT_BASELINE.QUANTITY_UNKNOWN) or the application is retired (SEAT_TARGET.APPLICATION_RETIRED).',
      examples: [
        SEAT_IMPORT_ERROR_EXAMPLES.BASELINE_CLOSED,
        SEAT_IMPORT_ERROR_EXAMPLES.QUANTITY_UNKNOWN,
        SEAT_IMPORT_ERROR_EXAMPLES.APPLICATION_RETIRED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the target is not one subscription or one internal plan (SEAT_BASELINE.TARGET_INVALID), its plan takes no baseline yet (SEAT_BASELINE.PLAN_NOT_SUPPORTED), the subscription is still a draft (SEAT_TARGET.SUBSCRIPTION_DRAFT, details.missing lists what it lacks), or the file cannot be used as a whole (SEAT_BASELINE_IMPORT.FILE_*).',
      examples: [
        VALIDATION_EXAMPLE,
        SEAT_IMPORT_ERROR_EXAMPLES.TARGET_INVALID,
        SEAT_IMPORT_ERROR_EXAMPLES.PLAN_NOT_SUPPORTED,
        SEAT_IMPORT_ERROR_EXAMPLES.SUBSCRIPTION_DRAFT,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_REQUIRED,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_EMPTY,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_NOT_TEXT,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_TOO_MANY_ROWS,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_UNREADABLE,
        SEAT_IMPORT_ERROR_EXAMPLES.FILE_MISSING_COLUMNS,
      ],
    },
  )
  async upload(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Body() body: UploadSeatImportBodyDto,
    @UploadedFile() file: UploadedBinary | undefined,
  ) {
    try {
      if (!file) throw new SeatImportFileInvalidError('FILE_REQUIRED');

      return toWire(
        await this.imports.upload(actor, {
          fileName: file.originalname,
          bytes: file.buffer,
          ...(body.subscriptionId ? { subscriptionId: body.subscriptionId } : {}),
          ...(body.planId ? { planId: body.planId } : {}),
        }),
      );
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineImportGet', summary: 'Get a seat baseline import' })
  @ApiSuccessResponse(SeatImportResponseDto, {
    message: 'SEAT_BASELINE_IMPORT.FETCHED',
    description: 'The import with its preview or its result.',
  })
  @ApiErrorResponses(...READ_ERRORS, NOT_FOUND, INVALID_ID)
  async get(@Param() params: SeatImportIdParamDto) {
    try {
      return toWire(await this.imports.view(params.id));
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }

  @Get(':id/rows')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineImportRows', summary: 'List the rows of a seat baseline import' })
  @ApiSuccessResponse(SeatImportRowsResponseDto, {
    message: 'SEAT_BASELINE_IMPORT.ROWS_LISTED',
    description:
      'A page of the rows in the order of the file, each with what it said, its outcome and the reasons it is wrong; outcome=ERROR lists the rows to fix. An identifier that looks like a secret is shown masked.',
  })
  @ApiErrorResponses(...READ_ERRORS, NOT_FOUND, INVALID_ID_OR_QUERY)
  async rows(@Param() params: SeatImportIdParamDto, @Query() query: ListSeatImportRowsQueryDto) {
    try {
      const page = await this.imports.rows(params.id, query);

      return { items: page.items, pagination: page.pagination };
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineImportConfirm', summary: 'Confirm a seat baseline preview' })
  @ApiSuccessResponse(SeatImportConfirmationResponseDto, {
    message: 'SEAT_BASELINE_IMPORT.CONFIRMED',
    description:
      'The valid rows of the preview that is still current became assignments marked as the baseline, with no request; the wrong rows created nothing. The same idempotency key again answers the same result with replayed.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The baseline is closed (SEAT_BASELINE.CLOSED), the application was retired since the preview (SEAT_TARGET.APPLICATION_RETIRED), the preview is outdated or stale (SEAT_BASELINE_IMPORT.PREVIEW_OUTDATED, PREVIEW_STALE), or the import was cancelled, expired or already written under another key (CANCELLED, EXPIRED, ALREADY_CONFIRMED).',
      examples: [
        SEAT_IMPORT_ERROR_EXAMPLES.BASELINE_CLOSED,
        SEAT_IMPORT_ERROR_EXAMPLES.APPLICATION_RETIRED,
        SEAT_IMPORT_ERROR_EXAMPLES.PREVIEW_OUTDATED,
        SEAT_IMPORT_ERROR_EXAMPLES.PREVIEW_STALE,
        SEAT_IMPORT_ERROR_EXAMPLES.CANCELLED,
        SEAT_IMPORT_ERROR_EXAMPLES.EXPIRED,
        SEAT_IMPORT_ERROR_EXAMPLES.ALREADY_CONFIRMED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the subscription is a draft (SEAT_TARGET.SUBSCRIPTION_DRAFT).',
      examples: [
        VALIDATION_EXAMPLE,
        SEAT_IMPORT_ERROR_EXAMPLES.SUBSCRIPTION_DRAFT,
        SEAT_IMPORT_ERROR_EXAMPLES.PLAN_NOT_SUPPORTED,
        SEAT_IMPORT_ERROR_EXAMPLES.TARGET_INVALID,
      ],
    },
  )
  async confirm(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SeatImportIdParamDto,
    @Body() body: ConfirmSeatImportBodyDto,
  ) {
    try {
      const { import: view, replayed } = await this.imports.confirm(actor, params.id, body);

      return { import: toWire(view), replayed };
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'seatBaselineImportCancel', summary: 'Throw a seat baseline preview away' })
  @ApiSuccessResponse(SeatImportResponseDto, {
    message: 'SEAT_BASELINE_IMPORT.CANCELLED',
    description: 'Nothing was written and nothing will be; cancelling twice is the same as once.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID, {
    status: HttpStatus.CONFLICT,
    description: 'The import was already written (SEAT_BASELINE_IMPORT.NOT_PREVIEW).',
    examples: [SEAT_IMPORT_ERROR_EXAMPLES.NOT_PREVIEW],
  })
  async cancel(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SeatImportIdParamDto) {
    try {
      return toWire(await this.imports.cancel(actor, params.id));
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }
}
