import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
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
import { toContractApiException } from './contract.http-errors';
import { ContractResponseDto, CreateContractBodyDto, IdParamDto } from './contract.dto';
import type { ContractRecord } from './contract.repo';
import { ContractService } from './contract.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const toWire = (contract: ContractRecord) => ({
  id: contract.id,
  name: contract.name,
  createdBy: contract.createdByAppUserId,
  createdAt: contract.createdAt.toISOString(),
});

/**
 * The contracts files are kept for (`US-04-04`, `OQ-B-17`): a name for now. The IT Admin makes one; the IT Admin and
 * Finance read it. The department head never opens a contract (`SoD-2`). There is no route that changes or deletes one.
 */
@ApiTags('contracts')
@Controller({ path: 'contracts', version: '1' })
export class ContractsController {
  constructor(private readonly contracts: ContractService) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'contractCreate', summary: 'Make a contract' })
  @ApiSuccessResponse(ContractResponseDto, {
    status: HttpStatus.CREATED,
    message: 'CONTRACT.CREATED',
    description: 'The contract, with the name given and who made it, as the signed-in IT Admin.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin makes a contract.' },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or the name is blank (CONTRACT.NAME_REQUIRED).',
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateContractBodyDto) {
    try {
      return { contract: toWire(await this.contracts.create(actor, body)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'contractGet', summary: 'Get a contract' })
  @ApiSuccessResponse(ContractResponseDto, { message: 'CONTRACT.FETCHED', description: 'The contract.' })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the IT Admin and Finance read a contract.' },
    { status: HttpStatus.NOT_FOUND, description: 'The contract does not exist (CONTRACT.NOT_FOUND).' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is invalid (VALIDATION_ERROR).' },
  )
  async get(@Param() params: IdParamDto) {
    try {
      return { contract: toWire(await this.contracts.get(params.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }
}
