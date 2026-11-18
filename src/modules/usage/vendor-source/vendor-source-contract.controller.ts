import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
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
import {
  UsageSourceContractListQueryDto,
  UsageSourceContractPageResponseDto,
  UsageSourceIdParamDto,
} from './vendor-source.dto';
import { USAGE_SOURCE_ERROR_EXAMPLES as EXAMPLES, toUsageSourceApiException } from './vendor-source.http-errors';
import { VendorSourceQueryService } from './vendor-source-query.service';
import type { ContractSourceView } from './vendor-source.types';

const toWire = (view: ContractSourceView) => ({
  id: view.id,
  name: view.name,
  application: { id: view.applicationId, name: view.applicationName },
  status: view.status,
});

/**
 * Where the usage of the applications of a contract comes from, for the IT Admin and Finance (`US-04-13` AC-15): the name of each source and
 * its status, read through the subscriptions that rest on the contract. It answers nothing of how a source reads a report, and the sources
 * themselves stay with the IT Admin: a reader of the contracts is not a reader of the usage (`QĐ-101i`).
 */
@ApiTags('usage-sources')
@Controller({ path: 'contracts/:id/usage-sources', version: '1' })
@RequireRoles('IT_ADMIN', 'FINANCE')
export class VendorSourceContractController {
  constructor(private readonly queries: VendorSourceQueryService) {}

  @Get()
  @ApiOperation({
    operationId: 'usageSourceListOfContract',
    summary: 'List the usage sources of the applications of a contract',
  })
  @ApiSuccessResponse(UsageSourceContractPageResponseDto, {
    message: 'USAGE_SOURCE.LISTED',
    description:
      'A page of the sources of the applications whose subscriptions rest on the contract, newest first: the name, the application and the status (ACTIVE, or RETIRED once the source no longer reads reports). A contract with no subscription has none.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin and Finance read the usage sources of a contract.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The contract does not exist (USAGE_SOURCE.CONTRACT_NOT_FOUND).',
      examples: [EXAMPLES.CONTRACT_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The identifier is not a UUID, or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Param() params: UsageSourceIdParamDto, @Query() query: UsageSourceContractListQueryDto) {
    try {
      const page = await this.queries.listOfContract(params.id, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toUsageSourceApiException(error);
    }
  }
}
