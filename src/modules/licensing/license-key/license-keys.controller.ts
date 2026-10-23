import { Body, Controller, Get, Header, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  ImportBodyDto,
  ImportResponseDto,
  KeyIdParamDto,
  KeyPageResponseDto,
  ListKeysQueryDto,
  RevealResponseDto,
} from './license-key.dto';
import { toLicenseKeyApiException } from './license-key.http-errors';
import { LicenseKeyService } from './license-key.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin works the vault of license keys.',
} as const;

/**
 * The vault of the license keys of K4 purchases (`US-04-12`): import a batch, list the keys masked, reveal one. Only the
 * IT Admin; no other role sees a key or a trace of one, and no route deletes or exports keys.
 */
@ApiTags('license-keys')
@Controller({ path: 'license-keys', version: '1' })
export class LicenseKeysController {
  constructor(private readonly keys: LicenseKeyService) {}

  @Post('imports')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'licenseKeyImport',
    summary: 'Import a batch of license keys into the vault of a K4 purchase',
  })
  @ApiSuccessResponse(ImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'LICENSE_KEY.IMPORTED',
    description:
      'Every valid key is kept, sealed. A line that is not kept is reported by its number with INVALID_FORMAT, DUPLICATE_IN_BATCH or ALREADY_IN_STORE, never with the key. The summary is the capacity of the purchase: the smaller of the seats bought and the keys still usable.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The purchase does not exist (SUBSCRIPTION.NOT_FOUND).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or the plan is not K4 (LICENSE_KEY.PLAN_NOT_K4).',
    },
  )
  async import(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: ImportBodyDto) {
    try {
      return await this.keys.import(actor, body);
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseKeyList', summary: 'List the license keys of a K4 purchase, masked' })
  @ApiSuccessResponse(KeyPageResponseDto, {
    message: 'LICENSE_KEY.LISTED',
    description:
      'The keys of the purchase, the oldest first, each with its last four characters only, and the capacity summary. warning is KEY_COUNT_DIFFERS when the keys are not as many as the seats bought and QUANTITY_UNKNOWN while the seats bought are not known.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    { status: HttpStatus.NOT_FOUND, description: 'The purchase does not exist (SUBSCRIPTION.NOT_FOUND).' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query is invalid (VALIDATION_ERROR).' },
  )
  async list(@Query() query: ListKeysQueryDto) {
    try {
      const page = await this.keys.list(query);

      return {
        items: page.items.map((item) => ({ ...item, importedAt: item.importedAt.toISOString() })),
        pagination: page.pagination,
        summary: page.summary,
      };
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }

  @Post(':id/reveal')
  @RequireRoles('IT_ADMIN')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'licenseKeyReveal', summary: 'Reveal a license key in full' })
  @ApiSuccessResponse(RevealResponseDto, {
    message: 'LICENSE_KEY.REVEALED',
    description:
      'The key in full. Every call writes an event of the audit trail (who, when, which key) in the same transaction, and the answer is never cached.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    { status: HttpStatus.NOT_FOUND, description: 'The key does not exist (LICENSE_KEY.NOT_FOUND).' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is invalid (VALIDATION_ERROR).' },
    {
      status: HttpStatus.TOO_MANY_REQUESTS,
      description:
        'The account has opened as many keys as it may in this minute (10) or this day (200): HTTP_TOO_MANY_REQUESTS. Nothing was opened and nothing was counted.',
    },
  )
  async reveal(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: KeyIdParamDto) {
    try {
      return await this.keys.reveal(actor, params.id);
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }
}
