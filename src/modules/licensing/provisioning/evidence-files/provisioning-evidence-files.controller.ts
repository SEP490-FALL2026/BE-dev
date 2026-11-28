import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { TaskIdParamDto } from '../provisioning.dto';
import { PROVISIONING_ERROR_EXAMPLES as EXAMPLES, toProvisioningApiException } from '../provisioning.http-errors';
import {
  EvidenceFileParamDto,
  EvidenceFileListResponseDto,
  EvidenceFileLinkResponseDto,
} from './provisioning-evidence-files.dto';
import { ProvisioningEvidenceFilesService } from './provisioning-evidence-files.service';

const ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the responsible IT Admin and Super Admin may read evidence files.',
    examples: [FORBIDDEN_EXAMPLE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The task is not visible to this person (PROVISIONING_TASK.NOT_FOUND).',
    examples: [EXAMPLES.TASK_NOT_FOUND],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'An id is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  },
] as const;

@ApiTags('provisioning-tasks')
@Controller({ path: 'provisioning-tasks', version: '1' })
export class ProvisioningEvidenceFilesController {
  constructor(private readonly files: ProvisioningEvidenceFilesService) {}

  @Get(':id/evidence-files')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    operationId: 'provisioningTaskEvidenceFileList',
    summary: 'List the evidence files of a provisioning task',
  })
  @ApiSuccessResponse(EvidenceFileListResponseDto, {
    message: 'PROVISIONING_TASK.EVIDENCE_FILES_LISTED',
    description:
      'At most six attached evidence files, ordered by attachment time and id. Only the current responsible IT Admin or Super Admin may read them.',
  })
  @ApiErrorResponses(...ERRORS)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TaskIdParamDto) {
    try {
      const files = await this.files.list(actor, params.id);
      return { items: files.map(({ attachedAt, ...file }) => ({ ...file, attachedAt: attachedAt.toISOString() })) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/evidence-files/:fileId/links')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    operationId: 'provisioningTaskEvidenceFileLink',
    summary: 'Get a download link for a provisioning evidence file',
  })
  @ApiSuccessResponse(EvidenceFileLinkResponseDto, {
    message: 'PROVISIONING_TASK.EVIDENCE_FILE_LINK_ISSUED',
    description: 'A download link valid for five minutes. The link is never cached or stored in the audit trail.',
  })
  @ApiErrorResponses(...ERRORS.filter((error) => error.status !== HttpStatus.NOT_FOUND), {
    status: HttpStatus.NOT_FOUND,
    description:
      'The task is hidden (PROVISIONING_TASK.NOT_FOUND), or its evidence file does not exist (PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND).',
    examples: [EXAMPLES.TASK_NOT_FOUND, EXAMPLES.EVIDENCE_FILE_NOT_FOUND],
  })
  async link(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: EvidenceFileParamDto) {
    try {
      const { url, expiresAt } = await this.files.link(actor, params.id, params.fileId);
      return { url, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }
}
