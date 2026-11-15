import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put } from '@nestjs/common';
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
import { LibraryDraftService } from './library-draft.service';
import { LibraryPublishService } from './library-publish.service';
import {
  DraftWriteBodyDto,
  PolicyCodeParamDto,
  PolicyDraftDiscardedResponseDto,
  PolicyDraftResponseDto,
  PolicyPublishedResponseDto,
  PublishBodyDto,
} from './library.dto';
import { LIBRARY_ERROR_EXAMPLES as EXAMPLES, toLibraryApiException } from './library.http-errors';
import { toPolicyDraft, toPublishedPolicyVersion } from './library.mapper';

const AUTH_ERRORS = [
  UNAUTHENTICATED_RESPONSE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin.', examples: [FORBIDDEN_EXAMPLE] },
] as const;
const VALIDATION_422 = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The code, the step or the query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/** The Super Admin writes the draft of a policy and publishes it; the policies themselves are fixed, none is made or deleted here. */
@ApiTags('policies')
@Controller({ path: 'policies', version: '1' })
export class LibraryDraftController {
  constructor(
    private readonly drafts: LibraryDraftService,
    private readonly publication: LibraryPublishService,
  ) {}

  @Get(':code/draft')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'policyDraftGet', summary: 'Read the draft of a policy' })
  @ApiSuccessResponse(PolicyDraftResponseDto, {
    message: 'POLICY_DRAFT.FETCHED',
    description: 'The draft being written: the title, the sections and steps, and the roles it would apply to.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422, {
    status: HttpStatus.NOT_FOUND,
    description: 'No such policy (POLICY.NOT_FOUND) or it has no draft (POLICY.DRAFT_NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND, EXAMPLES.DRAFT_NOT_FOUND],
  })
  async read(@Param() params: PolicyCodeParamDto) {
    try {
      return toPolicyDraft(await this.drafts.read(params.code));
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Put(':code/draft')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'policyDraftPut', summary: 'Open or change the draft of a policy' })
  @ApiSuccessResponse(PolicyDraftResponseDto, {
    message: 'POLICY_DRAFT.SAVED',
    description:
      'The draft after the write. With no draft open, it is first made as a copy of the version in force; the title and content given replace the same fields, the others are kept. An empty body only opens the copy.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No such policy (POLICY.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The policy has no published version to copy into a draft (POLICY.NOT_PUBLISHED).',
      examples: [EXAMPLES.NOT_PUBLISHED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR): a step or an item code that repeats, an empty checklist; or the draft changes what the company may not change: the set of steps (POLICY.STEP_SET_FIXED, details.added and details.removed) or the code of an item the system checks by itself (POLICY.SYSTEM_ITEM_UNKNOWN, details.codes).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.STEP_SET_FIXED, EXAMPLES.SYSTEM_ITEM_UNKNOWN],
    },
  )
  async write(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PolicyCodeParamDto,
    @Body() body: DraftWriteBodyDto,
  ) {
    try {
      return toPolicyDraft(
        await this.drafts.write(actor, params.code, {
          ...(body.title === undefined ? {} : { title: body.title }),
          ...(body.content === undefined ? {} : { content: body.content }),
        }),
      );
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Delete(':code/draft')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'policyDraftDelete', summary: 'Discard the draft of a policy' })
  @ApiSuccessResponse(PolicyDraftDiscardedResponseDto, {
    message: 'POLICY_DRAFT.DISCARDED',
    description: 'The draft was deleted; the version in force is untouched.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VALIDATION_422, {
    status: HttpStatus.NOT_FOUND,
    description: 'No such policy (POLICY.NOT_FOUND) or it has no draft (POLICY.DRAFT_NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND, EXAMPLES.DRAFT_NOT_FOUND],
  })
  async discard(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: PolicyCodeParamDto) {
    try {
      await this.drafts.discard(actor, params.code);

      return { policyCode: params.code, discarded: true as const };
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }

  @Post(':code/draft/publish')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'policyDraftPublish', summary: 'Publish the draft of a policy' })
  @ApiSuccessResponse(PolicyPublishedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'POLICY_VERSION.PUBLISHED',
    description:
      'The draft became the next version, in force at once and never changed again. Every account of a role it applies to was told; the first version always asks to be acknowledged.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No such policy (POLICY.NOT_FOUND) or it has no draft (POLICY.DRAFT_NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND, EXAMPLES.DRAFT_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR): no ground of the issue, no role, a role named twice; or the draft changes the set of steps (POLICY.STEP_SET_FIXED) or the code of an item the system checks by itself (POLICY.SYSTEM_ITEM_UNKNOWN) — a draft written before the rule is refused here too.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.STEP_SET_FIXED, EXAMPLES.SYSTEM_ITEM_UNKNOWN],
    },
  )
  async publish(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PolicyCodeParamDto,
    @Body() body: PublishBodyDto,
  ) {
    try {
      return toPublishedPolicyVersion(await this.publication.publish(actor, params.code, body));
    } catch (error) {
      throw toLibraryApiException(error);
    }
  }
}
