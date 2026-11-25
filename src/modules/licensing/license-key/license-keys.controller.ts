import { Body, Controller, Get, Header, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { GLOBAL_RATE_LIMIT_DESCRIPTION } from '../../../infrastructure/http/openapi-rate-limit';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ImportBodyDto,
  ImportResponseDto,
  KeyIdParamDto,
  KeyPageResponseDto,
  KeyResponseDto,
  ListKeysQueryDto,
  RevealResponseDto,
  UpdateKeyBodyDto,
  WithdrawalBodyDto,
} from './license-key.dto';
import type { LicenseKeyView } from './license-key.service';
import { REVEAL_LIMITS } from './license-key-reveal-quota.repo';
import { LICENSE_KEY_ERROR_EXAMPLES, toLicenseKeyApiException } from './license-key.http-errors';
import { LicenseKeyService } from './license-key.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin works the vault of license keys.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/** A key as the routes answer it: dates as ISO text. */
const wireOf = (key: LicenseKeyView) => ({
  id: key.id,
  subscriptionId: key.subscriptionId,
  licenseLot: key.licenseLotId === null ? null : { id: key.licenseLotId },
  masked: key.masked,
  status: key.status,
  importedAt: key.importedAt.toISOString(),
  assignmentId: key.assignmentId,
  withdrawnAt: key.withdrawnAt?.toISOString() ?? null,
  withdrawalReason: key.withdrawalReason,
  maxActivations: key.maxActivations,
  activationsUsed: key.activationsUsed,
  openActivations: key.openActivations,
  capReached: key.capReached,
  updatedAt: key.updatedAt.toISOString(),
});

/**
 * The vault of the license keys of K4 purchases (`US-04-12`) and the shared pool they form (`QĐ-103d`): import a batch, list the keys
 * masked, reveal one, withdraw a free one from the store. Only the IT Admin; no other role sees a key or a trace of one, and no route
 * deletes or exports keys.
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
      'Every valid key is kept, sealed. A line that is not kept is reported by its number with INVALID_FORMAT, DUPLICATE_IN_BATCH or ALREADY_IN_STORE, never with the key. The summary is the capacity of the purchase: for a plan bound to an account, the smaller of the seats bought and the keys still usable; for a key that goes on a machine (DEVICE_KEY), the licenses bought, with what is occupied and what is free. One maxActivations and one initialActivationsUsed apply to the whole batch: keys with another number are imported in another batch.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The purchase does not exist (SUBSCRIPTION.NOT_FOUND).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.SUBSCRIPTION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The batch tells initialActivationsUsed but the installation phase is closed (LICENSE_KEY.INITIALIZATION_CLOSED): after it the activations come from the machines. Nothing is kept.',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.INITIALIZATION_CLOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the plan is not K4 (LICENSE_KEY.PLAN_NOT_K4), it is bundled with the machine and has no keys (LICENSE_KEY.PLAN_HAS_NO_KEYS), its application is retired (LICENSE_KEY.APPLICATION_RETIRED), initialActivationsUsed is above the cap of the batch (LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX) or the plan puts its keys on an account and initialActivationsUsed is above 0 (LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN).',
      examples: [
        VALIDATION_EXAMPLE,
        LICENSE_KEY_ERROR_EXAMPLES.PLAN_NOT_K4,
        LICENSE_KEY_ERROR_EXAMPLES.PLAN_HAS_NO_KEYS,
        LICENSE_KEY_ERROR_EXAMPLES.APPLICATION_RETIRED,
        LICENSE_KEY_ERROR_EXAMPLES.INITIAL_ACTIVATIONS_EXCEED_MAX,
        LICENSE_KEY_ERROR_EXAMPLES.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN,
      ],
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
      'The keys of the purchase, the oldest first, each with its last four characters only, the seat it is given to while ASSIGNED and its withdrawal, and the capacity summary. A key is IN_STORE or ASSIGNED; a withdrawn key stays IN_STORE with withdrawnAt and is found with withdrawn=true. usableKeys counts the keys assigned or in the store and not withdrawn. warning is KEY_COUNT_DIFFERS when the keys are not as many as the seats bought and QUANTITY_UNKNOWN while the seats bought are not known.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The purchase does not exist (SUBSCRIPTION.NOT_FOUND).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.SUBSCRIPTION_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Query() query: ListKeysQueryDto) {
    try {
      // A lot has the id of the subscription it was born from, so the purchase of the list is either id.
      const page = await this.keys.list({
        ...query,
        subscriptionId: (query.licenseLotId ?? query.subscriptionId) as string,
      });

      return {
        items: page.items.map(wireOf),
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
      'The key in full. Every call writes an event of the audit trail (who, when, which key, the seat it is given to) in the same transaction, and the answer is never cached.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The key does not exist (LICENSE_KEY.NOT_FOUND).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The key was withdrawn from the store and is not opened any more (LICENSE_KEY.WITHDRAWN).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.WITHDRAWN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    {
      // Declaring a 429 here replaces the global one, so its wording is kept; the numbers are the quota's own.
      status: HttpStatus.TOO_MANY_REQUESTS,
      description:
        `The account has opened as many keys as it may in this minute (${REVEAL_LIMITS.MINUTE}) or this day ` +
        `(${REVEAL_LIMITS.DAY}): HTTP_TOO_MANY_REQUESTS. Nothing was opened and nothing was counted. ` +
        GLOBAL_RATE_LIMIT_DESCRIPTION,
      // The quota's own answer; the throttler's answer has the same code and is therefore not shown again.
      examples: [LICENSE_KEY_ERROR_EXAMPLES.REVEAL_LIMIT],
    },
  )
  async reveal(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: KeyIdParamDto) {
    try {
      return await this.keys.reveal(actor, params.id);
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }

  @Post(':id/withdrawal')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'licenseKeyWithdraw',
    summary: 'Withdraw a free license key from the store, with a reason',
  })
  @ApiSuccessResponse(KeyResponseDto, {
    message: 'LICENSE_KEY.WITHDRAWN',
    description:
      'The key stays in the vault (status IN_STORE) with withdrawnAt and withdrawalReason: it is no longer counted as usable, never given to a seat again and cannot be revealed. A withdrawal cannot be undone. One event of the audit trail (LICENSE_KEY.WITHDRAWN) is written in the same transaction.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The key does not exist (LICENSE_KEY.NOT_FOUND).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The key is assigned to a seat (LICENSE_KEY.ASSIGNED: revoke the seat, which puts the key back or withdraws it) or was withdrawn already (LICENSE_KEY.ALREADY_WITHDRAWN). Nothing is written.',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.ASSIGNED, LICENSE_KEY_ERROR_EXAMPLES.ALREADY_WITHDRAWN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the reason is invalid: a reason of 1 to 500 characters is required (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async withdraw(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: KeyIdParamDto,
    @Body() body: WithdrawalBodyDto,
  ) {
    try {
      return { key: wireOf(await this.keys.withdraw(actor, params.id, body)) };
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseKeyUpdate', summary: 'Raise the cap of activations of a license key' })
  @ApiSuccessResponse(KeyResponseDto, {
    message: 'LICENSE_KEY.UPDATED',
    description:
      'The key with its new maxActivations. The cap only goes up and the caller names the updatedAt it read (expectedUpdatedAt). One event of the audit trail (LICENSE_KEY.MAX_ACTIVATIONS_RAISED) says the old and the new cap and the note, in the same transaction.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The key does not exist (LICENSE_KEY.NOT_FOUND).',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The key changed since it was read (LICENSE_KEY.STALE, details.currentUpdatedAt): read it again. Nothing is written.',
      examples: [LICENSE_KEY_ERROR_EXAMPLES.STALE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR: a note of 1 to 500 characters, a cap of 1 to 100000 and expectedUpdatedAt are required) or the cap is not above the current one (LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED, details.current).',
      examples: [VALIDATION_EXAMPLE, LICENSE_KEY_ERROR_EXAMPLES.MAX_ACTIVATIONS_NOT_RAISED],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: KeyIdParamDto,
    @Body() body: UpdateKeyBodyDto,
  ) {
    try {
      const key = await this.keys.raiseMaxActivations(actor, params.id, {
        maxActivations: body.maxActivations,
        note: body.note,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });

      return { key: wireOf(key) };
    } catch (error) {
      throw toLicenseKeyApiException(error);
    }
  }
}
