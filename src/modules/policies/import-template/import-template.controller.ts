import { Controller, Get, HttpStatus, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { RawResponse } from '../../../infrastructure/http/decorators/raw-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { attachmentDisposition } from '../../../infrastructure/object-storage/content-disposition';
import { ImportTemplateParamDto, ImportTemplateQueryDto } from './import-template.dto';
import {
  IMPORT_TEMPLATE_ERROR_EXAMPLES as EXAMPLES,
  toImportTemplateApiException,
} from './import-template.http-errors';
import { ImportTemplateService } from './import-template.service';

/** The template of the file an import reads, made from what its parser reads (`QĐ-111as`). */
@ApiTags('import-templates')
@Controller({ path: 'import-templates', version: '1' })
export class ImportTemplateController {
  constructor(private readonly templates: ImportTemplateService) {}

  @Get(':kind')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN', 'MANAGER', 'FINANCE')
  @RawResponse()
  @ApiOperation({ operationId: 'importTemplateGet', summary: 'Download the template of an import file' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'The file: an xlsx with a sheet of example rows and a sheet of instructions (what each column holds, whether it is required, how it is written, what is refused), or the same rows as UTF-8 CSV. The example rows are fictitious and read back without error. Employees: Super Admin; seat baseline, license keys and usage reports: IT Admin; the budget form BM-10: department head and Finance.',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
      'text/csv': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller does not do this import (AUTHORIZATION.FORBIDDEN).',
      examples: [EXAMPLES.FORBIDDEN],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No module reads this kind of file (IMPORT_TEMPLATE.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The kind or the format is not one of the lists (VALIDATION_ERROR), or the parser of that file does not read the format asked (IMPORT_TEMPLATE.FORMAT_NOT_SUPPORTED, details.formats).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.FORMAT_NOT_SUPPORTED],
    },
  )
  async get(
    @CurrentPrincipal() caller: AuthenticatedPrincipal,
    @Param() params: ImportTemplateParamDto,
    @Query() query: ImportTemplateQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    try {
      const file = await this.templates.build(params.kind, query.format, caller.roles);
      response.setHeader('Content-Type', file.contentType);
      response.setHeader('Content-Disposition', attachmentDisposition(file.fileName));

      return new StreamableFile(file.bytes);
    } catch (error) {
      throw toImportTemplateApiException(error);
    }
  }
}
