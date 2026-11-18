import { Body, Controller, Delete, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CONTRACT_ERROR_EXAMPLES, toContractApiException } from './contract.http-errors';
import {
  ContractSubscriptionParamDto,
  ContractSubscriptionResponseDto,
  IdParamDto,
  LinkSubscriptionBodyDto,
} from './contract.dto';
import { toContractSubscriptionWire } from './contract.mapper';
import { ContractSubscriptionService } from './contract-subscription.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin links a subscription to a contract; Finance only reads.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The subscriptions that rest on a contract (`US-04-13` AC-6, AC-7; `QĐ-111t`): only those of a shared stock (K2 or K4), of the same vendor
 * as the contract, each on at most one contract. The IT Admin links and unlinks; what the contract lists of them is read with the contract.
 */
@ApiTags('contracts')
@Controller({ path: 'contracts/:id/subscriptions', version: '1' })
export class ContractSubscriptionsController {
  constructor(private readonly subscriptions: ContractSubscriptionService) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'contractSubscriptionLink', summary: 'Link a subscription to a contract' })
  @ApiSuccessResponse(ContractSubscriptionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'CONTRACT.SUBSCRIPTION_LINKED',
    description:
      'Links the subscription to the contract and answers with it as the contract lists it. Only a subscription of a shared stock (K2 or K4) whose application has the vendor of the contract is linked, and one that rests on no contract yet.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The contract or the subscription does not exist (CONTRACT.NOT_FOUND, CONTRACT.SUBSCRIPTION_NOT_FOUND).',
      examples: [CONTRACT_ERROR_EXAMPLES.CONTRACT_NOT_FOUND, CONTRACT_ERROR_EXAMPLES.SUBSCRIPTION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The subscription rests on a contract already, this one or another (CONTRACT.SUBSCRIPTION_ALREADY_LINKED).',
      examples: [CONTRACT_ERROR_EXAMPLES.SUBSCRIPTION_ALREADY_LINKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the subscription is not of a shared stock, K2 or K4 (CONTRACT.SUBSCRIPTION_KIND_NOT_ALLOWED), the contract has no vendor yet (CONTRACT.INCOMPLETE) or the vendor of the subscription is not the vendor of the contract (CONTRACT.SUBSCRIPTION_VENDOR_MISMATCH).',
      examples: [
        VALIDATION_EXAMPLE,
        CONTRACT_ERROR_EXAMPLES.SUBSCRIPTION_KIND_NOT_ALLOWED,
        CONTRACT_ERROR_EXAMPLES.INCOMPLETE,
        CONTRACT_ERROR_EXAMPLES.SUBSCRIPTION_VENDOR_MISMATCH,
      ],
    },
  )
  async link(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: LinkSubscriptionBodyDto,
  ) {
    try {
      return {
        subscription: toContractSubscriptionWire(await this.subscriptions.link(actor, params.id, body.subscriptionId)),
      };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Delete(':subscriptionId')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'contractSubscriptionUnlink', summary: 'Unlink a subscription from a contract' })
  @ApiSuccessResponse(ContractSubscriptionResponseDto, {
    message: 'CONTRACT.SUBSCRIPTION_UNLINKED',
    description:
      'The subscription no longer rests on the contract, and answers with what was unlinked. Neither the subscription nor the contract is deleted.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The contract does not exist, or the subscription is not linked to it (CONTRACT.NOT_FOUND, CONTRACT.SUBSCRIPTION_NOT_LINKED).',
      examples: [CONTRACT_ERROR_EXAMPLES.CONTRACT_NOT_FOUND, CONTRACT_ERROR_EXAMPLES.SUBSCRIPTION_NOT_LINKED],
    },
    INVALID,
  )
  async unlink(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ContractSubscriptionParamDto) {
    try {
      return {
        subscription: toContractSubscriptionWire(
          await this.subscriptions.unlink(actor, params.id, params.subscriptionId),
        ),
      };
    } catch (error) {
      throw toContractApiException(error);
    }
  }
}
