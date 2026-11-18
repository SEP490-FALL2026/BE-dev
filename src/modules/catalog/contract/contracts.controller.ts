import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
  ContractPageResponseDto,
  ContractResponseDto,
  CreateContractBodyDto,
  IdParamDto,
  ListContractsQueryDto,
  UpdateContractBodyDto,
} from './contract.dto';
import { toContractDetailWire, toContractSummaryWire } from './contract.mapper';
import { ContractQueryService } from './contract-query.service';
import { ContractService } from './contract.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin makes or changes a contract; Finance only reads.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const READERS_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read a contract.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The contract does not exist (CONTRACT.NOT_FOUND).',
  examples: [CONTRACT_ERROR_EXAMPLES.CONTRACT_NOT_FOUND],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The contracts files are kept for and subscriptions rest on (`US-04-13`, `QĐ-111t`). The IT Admin makes one and changes it, for a
 * reason; the IT Admin and Finance read the list and each contract. The department head never opens a contract (`SoD-2`). There is no
 * route that deletes one, and a contract has no kind: one that never ends is one with no end day.
 */
@ApiTags('contracts')
@Controller({ path: 'contracts', version: '1' })
export class ContractsController {
  constructor(
    private readonly contracts: ContractService,
    private readonly reads: ContractQueryService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'contractList', summary: 'List the contracts' })
  @ApiSuccessResponse(ContractPageResponseDto, {
    message: 'CONTRACT.LISTED',
    description:
      'A page of contracts, by the day they begin (the latest first unless order says otherwise; those with no beginning last). Each says its vendor, its days, its status as of today and how many subscriptions rest on it. search matches the name and the number, vendorId and status narrow the list, effectiveOn keeps the contracts in effect on a day. The company has one list: it is not cut by department.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, INVALID)
  async list(@Query() query: ListContractsQueryDto) {
    try {
      const page = await this.reads.list(query);

      return { items: page.items.map(toContractSummaryWire), pagination: page.pagination };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'contractCreate', summary: 'Make a contract' })
  @ApiSuccessResponse(ContractResponseDto, {
    status: HttpStatus.CREATED,
    message: 'CONTRACT.CREATED',
    description:
      'The contract, with the vendor, the number, the days it is in effect (an empty end day: it never ends) and the note given, who made it, and no subscription yet.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the name is blank (CONTRACT.NAME_REQUIRED), the vendor or the day it begins is missing (CONTRACT.VENDOR_REQUIRED, CONTRACT.EFFECTIVE_FROM_REQUIRED), the vendor is not in the catalog (CONTRACT.VENDOR_NOT_FOUND), or the end is before the beginning (CONTRACT.EFFECTIVE_RANGE_INVALID).',
      examples: [
        VALIDATION_EXAMPLE,
        CONTRACT_ERROR_EXAMPLES.NAME_REQUIRED,
        CONTRACT_ERROR_EXAMPLES.VENDOR_REQUIRED,
        CONTRACT_ERROR_EXAMPLES.EFFECTIVE_FROM_REQUIRED,
        CONTRACT_ERROR_EXAMPLES.VENDOR_NOT_FOUND,
        CONTRACT_ERROR_EXAMPLES.EFFECTIVE_RANGE_INVALID,
      ],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Another contract has this number, compared ignoring case, accents and extra spaces (CONTRACT.NUMBER_TAKEN).',
      examples: [CONTRACT_ERROR_EXAMPLES.NUMBER_TAKEN],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateContractBodyDto) {
    try {
      const contract = await this.contracts.create(actor, body);

      return { contract: toContractDetailWire(await this.reads.detail(contract.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'contractGet', summary: 'Get a contract' })
  @ApiSuccessResponse(ContractResponseDto, {
    message: 'CONTRACT.FETCHED',
    description:
      'The contract with its note, its status as of today, and a slice of its subscriptions, its ready files and the applications of its subscriptions (each array lists up to 100; truncated says when there are more). The usage sources of an application are read from the usage sources of that application, not from here.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, NOT_FOUND, INVALID)
  async get(@Param() params: IdParamDto) {
    try {
      return { contract: toContractDetailWire(await this.reads.detail(params.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'contractUpdate', summary: 'Change a contract' })
  @ApiSuccessResponse(ContractResponseDto, {
    message: 'CONTRACT.UPDATED',
    description:
      'Changes the fields named and keeps the others, for the reason given; the Audit Trail keeps the reason with the values before and after. The vendor does not change while a subscription is linked. A change that leaves every field as it is writes nothing.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ADMIN_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or there is no reason (CONTRACT.REASON_REQUIRED), no field to change (CONTRACT.UPDATE_EMPTY), a blank name (CONTRACT.NAME_REQUIRED), a vendor that is not in the catalog (CONTRACT.VENDOR_NOT_FOUND), or days that make no period (CONTRACT.EFFECTIVE_RANGE_INVALID).',
      examples: [
        VALIDATION_EXAMPLE,
        CONTRACT_ERROR_EXAMPLES.REASON_REQUIRED,
        CONTRACT_ERROR_EXAMPLES.UPDATE_EMPTY,
        CONTRACT_ERROR_EXAMPLES.NAME_REQUIRED,
        CONTRACT_ERROR_EXAMPLES.VENDOR_NOT_FOUND,
        CONTRACT_ERROR_EXAMPLES.EFFECTIVE_RANGE_INVALID,
      ],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Another contract has this number (CONTRACT.NUMBER_TAKEN), or a subscription is linked and the vendor cannot change (CONTRACT.VENDOR_LOCKED).',
      examples: [CONTRACT_ERROR_EXAMPLES.NUMBER_TAKEN, CONTRACT_ERROR_EXAMPLES.VENDOR_LOCKED],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: UpdateContractBodyDto,
  ) {
    try {
      await this.contracts.update(actor, params.id, body);

      return { contract: toContractDetailWire(await this.reads.detail(params.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }
}
