import { Body, Controller, Get, HttpStatus, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
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
  ConfirmImportBodyDto,
  EmployeeImportConfirmationResponseDto,
  EmployeeImportResponseDto,
  EmployeeImportRowsResponseDto,
  ImportIdParamDto,
  ListImportRowsQueryDto,
} from './employee-import.dto';
import { ImportFileInvalidError } from './employee-import.errors';
import { IMPORT_ERROR_EXAMPLES, toImportApiException } from './employee-import.http-errors';
import { ImportView } from './employee-import.types';
import { EmployeeImportConfirmationService } from './confirmation/employee-import-confirmation.service';
import { EmployeeImportPreviewService } from './preview/employee-import-preview.service';

/** The largest file the route reads: a people file of 1 000 rows is far smaller. */
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

/** The part of a multipart upload this controller uses; multer's own type is not a dependency of the project. */
interface UploadedBinary {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin imports people.', examples: [FORBIDDEN_EXAMPLE] },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
/** Reading an import and its rows is the Super Admin's, as uploading and confirming it are. */
const READ_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the Super Admin reads an employee import and its rows.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The import does not exist (IMPORT.NOT_FOUND).',
  examples: [IMPORT_ERROR_EXAMPLES.NOT_FOUND],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The identifier is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

function toWire(view: ImportView) {
  return {
    id: view.id,
    fileName: view.fileName,
    status: view.status,
    previewVersion: view.previewVersion,
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
 * Importing people from a file in six steps (`US-02-01`): upload → read → preview → confirm → write → summary. The Super
 * Admin uploads a CSV file and confirms it with the HR basis it is entered on; nothing is written until the preview is
 * confirmed, and then once. The IT Admin, Managers and Finance do not import people (`US-02-02` AC-12, `QĐ-82i`).
 * Upload, reading, judging again and cancelling are the preview (`preview/`); writing the people is the confirmation
 * (`confirmation/`).
 */
@ApiTags('employee-imports')
@Controller({ path: 'employee-imports', version: '1' })
export class EmployeeImportsController {
  constructor(
    private readonly previews: EmployeeImportPreviewService,
    private readonly confirmations: EmployeeImportConfirmationService,
  ) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ operationId: 'employeeImportUpload', summary: 'Upload an employee file for preview' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiSuccessResponse(EmployeeImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'EMPLOYEE_IMPORT.UPLOADED',
    description:
      'The file was read and every row judged: nothing is written yet. The summary says how many rows are valid, wrong, there already, and the people by department.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, ...UPLOAD_LIMIT_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The file cannot be used as a whole: missing, empty, not text, unreadable, too many rows, or lacking a required column such as the department (IMPORT.FILE_*); the job title column is optional.',
    examples: [
      IMPORT_ERROR_EXAMPLES.FILE_REQUIRED,
      IMPORT_ERROR_EXAMPLES.FILE_EMPTY,
      IMPORT_ERROR_EXAMPLES.FILE_NOT_TEXT,
      IMPORT_ERROR_EXAMPLES.FILE_TOO_MANY_ROWS,
      IMPORT_ERROR_EXAMPLES.FILE_UNREADABLE,
      IMPORT_ERROR_EXAMPLES.FILE_MISSING_COLUMNS,
    ],
  })
  async upload(@CurrentPrincipal() actor: AuthenticatedPrincipal, @UploadedFile() file: UploadedBinary | undefined) {
    try {
      if (!file) throw new ImportFileInvalidError('FILE_REQUIRED');

      return toWire(await this.previews.upload(actor, { fileName: file.originalname, bytes: file.buffer }));
    } catch (error) {
      throw toImportApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'employeeImportGet', summary: 'Get an employee import' })
  @ApiSuccessResponse(EmployeeImportResponseDto, {
    message: 'EMPLOYEE_IMPORT.FETCHED',
    description: 'The import with its preview or its result.',
  })
  @ApiErrorResponses(...READ_ERRORS, NOT_FOUND, INVALID_ID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ImportIdParamDto) {
    try {
      return toWire(await this.previews.view(actor, params.id));
    } catch (error) {
      throw toImportApiException(error);
    }
  }

  @Get(':id/rows')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'employeeImportRowList', summary: 'List the rows of an employee import' })
  @ApiSuccessResponse(EmployeeImportRowsResponseDto, {
    message: 'EMPLOYEE_IMPORT.ROWS_LISTED',
    description:
      'The rows of the file with what the preview made of each: the line, the cells, the errors with their column and code, the differences of a person already there. Filter by outcome to download the errors.',
  })
  @ApiErrorResponses(...READ_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The identifier is not a UUID, or the filter or paging query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async rows(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ImportIdParamDto,
    @Query() query: ListImportRowsQueryDto,
  ) {
    try {
      const page = await this.previews.rows(actor, params.id, query);

      return {
        items: page.items.map((row) => ({
          line: row.lineNumber,
          outcome: row.outcome,
          cells: row.cells,
          errors: row.errors,
          differences: row.differences,
        })),
        pagination: page.pagination,
      };
    } catch (error) {
      throw toImportApiException(error);
    }
  }

  @Post(':id/preview-refreshes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'employeeImportPreviewRefresh', summary: 'Check an employee import again' })
  @ApiSuccessResponse(EmployeeImportResponseDto, {
    message: 'EMPLOYEE_IMPORT.PREVIEW_REFRESHED',
    description:
      'The same rows are judged again against the data as it is now, as a new preview version; the older version can no longer be confirmed.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID, {
    status: HttpStatus.CONFLICT,
    description: 'The import is no longer a preview (IMPORT.CANCELLED, IMPORT.NOT_PREVIEW).',
    examples: [IMPORT_ERROR_EXAMPLES.CANCELLED, IMPORT_ERROR_EXAMPLES.NOT_PREVIEW],
  })
  async refresh(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ImportIdParamDto) {
    try {
      return toWire(await this.previews.refresh(actor, params.id));
    } catch (error) {
      throw toImportApiException(error);
    }
  }

  @Post(':id/confirmations')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'employeeImportConfirm', summary: 'Confirm an employee import' })
  @ApiSuccessResponse(EmployeeImportConfirmationResponseDto, {
    message: 'EMPLOYEE_IMPORT.CONFIRMED',
    description:
      'The people the preview promised are created, once, on the HR basis given; each carries it in the Audit Trail. The same confirmation sent again (same idempotency key) returns the first answer with replayed set.',
  })
  @ApiErrorResponses(
    ...COMMON_ERRORS,
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid or lacks a part of the HR basis (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The preview is not the current one (IMPORT.PREVIEW_OUTDATED), the data changed since it (IMPORT.PREVIEW_STALE), the file was imported before and not acknowledged (IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED), the import was already written with another key (IMPORT.ALREADY_CONFIRMED), or it was cancelled or expired. Nothing was written.',
      examples: [
        IMPORT_ERROR_EXAMPLES.PREVIEW_OUTDATED,
        IMPORT_ERROR_EXAMPLES.PREVIEW_STALE,
        IMPORT_ERROR_EXAMPLES.DUPLICATE_FILE_NOT_ACKNOWLEDGED,
        IMPORT_ERROR_EXAMPLES.ALREADY_CONFIRMED,
        IMPORT_ERROR_EXAMPLES.CANCELLED,
        IMPORT_ERROR_EXAMPLES.EXPIRED,
      ],
    },
  )
  async confirm(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ImportIdParamDto,
    @Body() body: ConfirmImportBodyDto,
  ) {
    try {
      const confirmed = await this.confirmations.confirm(actor, params.id, body);

      return { replayed: confirmed.replayed, import: toWire(confirmed.import) };
    } catch (error) {
      throw toImportApiException(error);
    }
  }

  @Post(':id/cancellations')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'employeeImportCancel', summary: 'Cancel an employee import' })
  @ApiSuccessResponse(EmployeeImportResponseDto, {
    message: 'EMPLOYEE_IMPORT.CANCELLED',
    description: 'The preview is thrown away; nothing was written and nothing will be. Cancelling twice is the same.',
  })
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID, {
    status: HttpStatus.CONFLICT,
    description: 'The import was already written (IMPORT.NOT_PREVIEW).',
    examples: [IMPORT_ERROR_EXAMPLES.NOT_PREVIEW],
  })
  async cancel(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ImportIdParamDto) {
    try {
      return toWire(await this.previews.cancel(actor, params.id));
    } catch (error) {
      throw toImportApiException(error);
    }
  }
}
