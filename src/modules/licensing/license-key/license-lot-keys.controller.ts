import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ImportIntoLotBodyDto, ImportResponseDto } from './license-key.dto';
import { LICENSE_KEY_ERROR_EXAMPLES as EXAMPLES, toLicenseKeyApiException } from './license-key.http-errors';
import { LicenseLotKeyImportService } from './license-lot-key-import.service';

class LotIdParamDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}

/**
 * Puts license keys in a lot (`QĐ-115n`): the same batch as the import of wave 2 (`licenseKeyImport`), named by the lot instead of the subscription, and only
 * for the IT Admin who answers for the lot. A lot of a plan bound to an account never holds more keys than licenses; a lot whose key goes on a machine has no limit of keys.
 */
@ApiTags('license-lots')
@Controller({ path: 'license-lots', version: '1' })
export class LicenseLotKeysController {
  constructor(private readonly keys: LicenseLotKeyImportService) {}

  @Post(':id/keys')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseLotKeyImport', summary: 'Put a batch of license keys in a lot' })
  @ApiSuccessResponse(ImportResponseDto, {
    status: HttpStatus.CREATED,
    message: 'LICENSE_KEY.IMPORTED',
    description:
      'Every valid key is kept, sealed, in the lot. A line that is not kept is reported by its number, never with the key. The summary is the capacity of the lot: for a plan bound to an account, the smaller of the licenses bought and the keys still usable; for a key that goes on a machine, the licenses bought with what is occupied and what is free. One maxActivations and one initialActivationsUsed apply to the whole batch.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin who answers for the lot puts keys in it (LICENSE_LOT.NOT_RESPONSIBLE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.LOT_NOT_RESPONSIBLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The lot does not exist (LICENSE_LOT.NOT_FOUND).',
      examples: [EXAMPLES.LOT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The batch tells initialActivationsUsed but the installation phase is closed (LICENSE_KEY.INITIALIZATION_CLOSED). Nothing is kept.',
      examples: [EXAMPLES.INITIALIZATION_CLOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the keys would pass the licenses of the lot (LICENSE_LOT.KEYS_EXCEED_LICENSES), the application is retired (LICENSE_KEY.APPLICATION_RETIRED), the plan has no keys (LICENSE_KEY.PLAN_HAS_NO_KEYS) or initialActivationsUsed does not fit (LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX, LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.LOT_KEYS_EXCEED_LICENSES,
        EXAMPLES.PLAN_HAS_NO_KEYS,
        EXAMPLES.APPLICATION_RETIRED,
        EXAMPLES.INITIAL_ACTIVATIONS_EXCEED_MAX,
        EXAMPLES.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN,
      ],
    },
  )
  async import(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LotIdParamDto,
    @Body() body: ImportIntoLotBodyDto,
  ) {
    try {
      return await this.keys.import(actor, params.id, body, { responsibleOnly: true });
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }
}
