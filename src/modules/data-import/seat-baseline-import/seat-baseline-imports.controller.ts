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
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
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
import { toSeatImportApiException } from './seat-baseline-import.http-errors';
import { SeatBaselineImportService } from './seat-baseline-import.service';
import type { SeatImportView } from './seat-baseline-import.types';

/** The largest file the route reads: a seat file of 1 000 rows is far smaller. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** The part of a multipart upload this controller uses; multer own type is not a dependency of the project. */
interface UploadedBinary {
  originalname: string;
  buffer: Buffer;
  size: number;
}

const COMMON_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin imports the seat baseline.' },
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The import does not exist (SEAT_BASELINE_IMPORT.NOT_FOUND).',
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The identifier is not a UUID (VALIDATION_ERROR).',
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
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
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription or the plan does not exist (SUBSCRIPTION.NOT_FOUND, PLAN.NOT_FOUND).',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The baseline is closed (SEAT_BASELINE.CLOSED) or the subscription has no quantity (SEAT_BASELINE.QUANTITY_UNKNOWN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the target is not one subscription or one internal plan (SEAT_BASELINE.TARGET_INVALID), its plan takes no baseline yet (SEAT_BASELINE.PLAN_NOT_SUPPORTED), or the file cannot be used as a whole (SEAT_BASELINE_IMPORT.FILE_*).',
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
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID)
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
  @ApiErrorResponses(...COMMON_ERRORS, NOT_FOUND, INVALID_ID)
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
        'The baseline is closed (SEAT_BASELINE.CLOSED), the preview is outdated or stale (SEAT_BASELINE_IMPORT.PREVIEW_OUTDATED, PREVIEW_STALE), or the import was cancelled, expired or already written under another key (CANCELLED, EXPIRED, ALREADY_CONFIRMED).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The request is invalid (VALIDATION_ERROR).' },
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
  })
  async cancel(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SeatImportIdParamDto) {
    try {
      return toWire(await this.imports.cancel(actor, params.id));
    } catch (error) {
      throw toSeatImportApiException(error);
    }
  }
}
