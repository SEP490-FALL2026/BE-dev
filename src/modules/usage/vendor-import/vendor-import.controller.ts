import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  fallbackExample,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { VALIDATION_ERROR_BODY } from '../../../infrastructure/http/pipes/zod-validation.pipe';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { USAGE_SOURCE_ERROR_EXAMPLES } from '../vendor-source/vendor-source.http-errors';
import {
  ConfirmUsageImportBodyDto,
  idempotencyKeySchema,
  ListUsageImportRowsQueryDto,
  UploadUsageImportBodyDto,
  UsageImportConfirmationResponseDto,
  UsageImportIdParamDto,
  UsageImportResponseDto,
  UsageImportRowsResponseDto,
} from './vendor-import.dto';
import { UsageImportFileError } from './vendor-import.errors';
import { toUsageImportApiException, USAGE_IMPORT_ERROR_EXAMPLES as EXAMPLES } from './vendor-import.http-errors';
import { VendorImportConfirmationService } from './confirmation/vendor-import-confirmation.service';
import { VendorImportQueryService } from './vendor-import-query.service';
import { VendorImportService } from './vendor-import.service';
import { MAX_REPORT_BYTES, type ImportView, type StoredRow } from './vendor-import.types';

/** One file and three short fields, nothing else, of no more than the size of a report (`SEC-06`). */
const UPLOAD_LIMITS = { fileSize: MAX_REPORT_BYTES, files: 1, fields: 3, fieldSize: 64, parts: 4 };
const UPLOAD_LIMIT_ERRORS = [
  {
    status: HttpStatus.BAD_REQUEST,
    description:
      'The form breaks a limit of the upload before it is read — more than one file, more than three text fields, a text field over 64 bytes — or it is not a readable multipart form (HTTP_BAD_REQUEST).',
    examples: [fallbackExample(HttpStatus.BAD_REQUEST)],
  },
  {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: `The file is larger than ${MAX_REPORT_BYTES / (1024 * 1024)} MiB (HTTP_PAYLOAD_TOO_LARGE).`,
    examples: [fallbackExample(HttpStatus.PAYLOAD_TOO_LARGE)],
  },
] as const;

interface UploadedBinary {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only an IT Admin imports the usage of a vendor: a head of department never reads the raw usage.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The import does not exist (USAGE_IMPORT.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The identifier is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

const UPLOAD_ERRORS = [
  ...COMMON_ERRORS,
  ...UPLOAD_LIMIT_ERRORS,
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The source does not exist (USAGE_SOURCE.NOT_FOUND).',
    examples: [USAGE_SOURCE_ERROR_EXAMPLES.NOT_FOUND],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR), the application of the source is internal, retired or a communication service (USAGE_SOURCE.APPLICATION_*, COMMUNICATION_APP), or the file cannot be used as a whole (USAGE_IMPORT.FILE_*, SCHEMA_UNSUPPORTED, REPORT_INVALID, SOURCE_MISMATCH, WINDOW_REQUIRED, WINDOW_INVALID).',
    examples: [
      VALIDATION_EXAMPLE,
      USAGE_SOURCE_ERROR_EXAMPLES.APPLICATION_INTERNAL,
      USAGE_SOURCE_ERROR_EXAMPLES.APPLICATION_RETIRED,
      USAGE_SOURCE_ERROR_EXAMPLES.COMMUNICATION_APP,
      EXAMPLES.FILE_REQUIRED,
      EXAMPLES.FILE_EMPTY,
      EXAMPLES.FILE_NOT_TEXT,
      EXAMPLES.FILE_TOO_MANY_ROWS,
      EXAMPLES.FILE_UNREADABLE,
      EXAMPLES.FILE_MISSING_COLUMNS,
      EXAMPLES.SCHEMA_UNSUPPORTED,
      EXAMPLES.REPORT_INVALID,
      EXAMPLES.SOURCE_MISMATCH,
      EXAMPLES.WINDOW_REQUIRED,
      EXAMPLES.WINDOW_INVALID,
    ],
  },
] as const;

const CONFIRM_ERRORS = [
  {
    status: HttpStatus.CONFLICT,
    description:
      'The preview is not the current one or no longer holds (USAGE_IMPORT.PREVIEW_STALE), the import was cancelled or expired (NOT_OPEN), or it was already confirmed under another key (ALREADY_CONFIRMED).',
    examples: [EXAMPLES.PREVIEW_STALE, EXAMPLES.NOT_OPEN, EXAMPLES.ALREADY_CONFIRMED],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request or the Idempotency-Key is invalid (VALIDATION_ERROR), the report has types of event nobody sorted (USAGE_IMPORT.EVENT_TYPE_UNMAPPED), the holders of the first report were not told (TRACKING_NOTICE_REQUIRED), or the application became a communication service (USAGE_SOURCE.COMMUNICATION_APP).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.EVENT_TYPE_UNMAPPED,
      EXAMPLES.TRACKING_NOTICE_REQUIRED,
      USAGE_SOURCE_ERROR_EXAMPLES.COMMUNICATION_APP,
    ],
  },
] as const;

export function importToWire(view: ImportView) {
  return {
    id: view.id,
    sourceId: view.sourceId,
    format: view.format,
    status: view.status,
    previewVersion: view.previewVersion,
    summary: view.summary,
    result: view.result,
    noticeMode: view.noticeMode,
    createdAt: view.createdAt.toISOString(),
    expiresAt: view.expiresAt.toISOString(),
    confirmedAt: view.confirmedAt ? view.confirmedAt.toISOString() : null,
    cancelledAt: view.cancelledAt ? view.cancelledAt.toISOString() : null,
  };
}

const rowToWire = (row: StoredRow) => ({
  lineNumber: row.lineNumber,
  identifier: row.identifierRaw,
  days: row.cells.days,
  outcome: row.outcome,
  matchMethod: row.matchMethod,
  errors: row.errors,
});

/**
 * Taking in the usage a vendor reports (`SBF-04a`): upload → preview → confirm. The IT Admin uploads a CSV or JSON report for one source with
 * the window it covers; nothing is written until the preview is confirmed, and then once.
 */
@ApiTags('usage-imports')
@Controller({ path: 'usage-imports', version: '1' })
@RequireRoles('IT_ADMIN')
export class VendorImportController {
  constructor(
    private readonly imports: VendorImportService,
    private readonly queries: VendorImportQueryService,
    private readonly confirmations: VendorImportConfirmationService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ operationId: 'usageImportUpload', summary: 'Upload a vendor usage report for preview' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'sourceId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        sourceId: { type: 'string', format: 'uuid' },
        coverageFrom: { type: 'string', format: 'date' },
        coverageTo: { type: 'string', format: 'date' },
      },
    },
  })
  @ApiSuccessResponse(UsageImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'USAGE_IMPORT.UPLOADED',
    description:
      'The report was read and every row judged against the people and the seats as they are: nothing of the usage is written yet. The summary gives the window it covers, the rows not matched, the seats it affects, the groups it can detect and what counts as activity.',
  })
  @ApiErrorResponses(...UPLOAD_ERRORS)
  async upload(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Body() body: UploadUsageImportBodyDto,
    @UploadedFile() file: UploadedBinary | undefined,
  ) {
    try {
      if (!file) throw new UsageImportFileError('FILE_REQUIRED');

      return importToWire(
        await this.imports.upload(actor, {
          sourceId: body.sourceId,
          bytes: file.buffer,
          ...(body.coverageFrom ? { coverageFrom: body.coverageFrom } : {}),
          ...(body.coverageTo ? { coverageTo: body.coverageTo } : {}),
        }),
      );
    } catch (error) {
      throw toUsageImportApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'usageImportGet', summary: 'Get a usage import' })
  @ApiSuccessResponse(UsageImportResponseDto, {
    message: 'USAGE_IMPORT.FETCHED',
    description: 'The import with its preview or its result.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID)
  async get(@Param() params: UsageImportIdParamDto) {
    try {
      return importToWire(await this.queries.view(params.id));
    } catch (error) {
      throw toUsageImportApiException(error);
    }
  }

  @Get(':id/rows')
  @ApiOperation({ operationId: 'usageImportRowList', summary: 'List the rows of a usage import' })
  @ApiSuccessResponse(UsageImportRowsResponseDto, {
    message: 'USAGE_IMPORT.ROWS_LISTED',
    description:
      'A page of the rows in the order of the file, each with its days, who it was matched to and how, and the reasons it is wrong; outcome filters. An identifier that looks like a secret is shown masked.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID)
  async rows(@Param() params: UsageImportIdParamDto, @Query() query: ListUsageImportRowsQueryDto) {
    try {
      const page = await this.queries.rows(params.id, query);

      return { items: page.items.map(rowToWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageImportApiException(error);
    }
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'A key the caller makes once for this confirmation (16 to 128 letters, digits, - or _); sending it again answers what was written, another key is refused.',
  })
  @ApiOperation({ operationId: 'usageImportConfirm', summary: 'Confirm a usage import preview' })
  @ApiSuccessResponse(UsageImportConfirmationResponseDto, {
    message: 'USAGE_IMPORT.CONFIRMED',
    description:
      'The holders of the application were told, then the days of the preview that is still current were written, once. The same key again answers the same result with replayed.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, ...CONFIRM_ERRORS)
  async confirm(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: UsageImportIdParamDto,
    @Body() body: ConfirmUsageImportBodyDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
        ...VALIDATION_ERROR_BODY,
        details: { issues: [{ code: 'invalid_format', path: 'Idempotency-Key' }] },
      });
    }
    try {
      const { import: view, replayed } = await this.confirmations.confirm(actor, params.id, {
        previewVersion: body.previewVersion,
        idempotencyKey: key.data,
        ...(body.notice ? { notice: body.notice } : {}),
      });

      return { import: importToWire(view), replayed };
    } catch (error) {
      throw toUsageImportApiException(error);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'usageImportCancel', summary: 'Throw a usage import preview away' })
  @ApiSuccessResponse(UsageImportResponseDto, {
    message: 'USAGE_IMPORT.CANCELLED',
    description: 'Nothing was written and nothing will be; cancelling twice is the same as once.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID, {
    status: HttpStatus.CONFLICT,
    description: 'The import was already confirmed (USAGE_IMPORT.NOT_PREVIEW).',
    examples: [EXAMPLES.NOT_PREVIEW],
  })
  async cancel(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: UsageImportIdParamDto) {
    try {
      return importToWire(await this.imports.cancel(actor, params.id));
    } catch (error) {
      throw toUsageImportApiException(error);
    }
  }
}
