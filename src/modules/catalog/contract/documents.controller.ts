import { Body, Controller, Header, Get, HttpStatus, Param, Post } from '@nestjs/common';
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
  AttachDocumentBodyDto,
  CreateDocumentBodyDto,
  CreateDocumentResponseDto,
  DocumentLinkResponseDto,
  DocumentResponseDto,
  IdParamDto,
} from './contract.dto';
import { toContractApiException } from './contract.http-errors';
import type { DocumentRecord } from './document.repo';
import { DocumentService } from './document.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const ROLES = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the IT Admin and Finance keep and open files: the department head, an employee, the spending approver and the Super Admin are refused.',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The document does not exist for this person: it is not theirs and not attached yet, not uploaded yet, or quarantined (DOCUMENT.NOT_FOUND).',
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is invalid (VALIDATION_ERROR).',
} as const;

const toWire = (document: DocumentRecord) => ({
  id: document.id,
  purpose: document.purpose,
  status: document.status,
  fileName: document.fileName,
  contentType: document.contentType,
  sizeBytes: document.sizeBytes,
  uploadedBy: document.uploadedByAppUserId,
  createdAt: document.createdAt.toISOString(),
  contractId: document.contractId,
  attachedAt: document.attachedAt?.toISOString() ?? null,
});

/**
 * The private files kept for contracts (`US-04-04`). The system never receives the bytes: it declares and judges a file,
 * gives a link to put it in the storage, looks at what was stored, attaches it to a contract, and gives a link that opens
 * it for five minutes. No link is stored; the uploader is always the signed-in person.
 */
@ApiTags('documents')
@Controller({ path: 'documents', version: '1' })
export class DocumentsController {
  constructor(private readonly documents: DocumentService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'documentCreate', summary: 'Declare a file and get the link to upload it' })
  @ApiSuccessResponse(CreateDocumentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'DOCUMENT.CREATED',
    description:
      'The file is declared as awaiting its upload, with the link to put it in the storage: it lives two minutes and takes only a file of the declared type and size. The response is never cached. The uploader is the signed-in person; the body cannot say otherwise.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Not the IT Admin or Finance, or the role may not choose this purpose (DOCUMENT.PURPOSE_FORBIDDEN).',
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The purpose has nowhere to be attached yet (DOCUMENT.PURPOSE_NOT_AVAILABLE).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the file is refused: DOCUMENT.TYPE_NOT_ALLOWED, TOO_LARGE or FILE_INVALID. Nothing is made.',
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateDocumentBodyDto) {
    try {
      const { document, upload } = await this.documents.create(actor, body);

      return { document: toWire(document), upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Post(':id/complete')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'documentComplete', summary: 'Say the file is uploaded, for the system to look at it' })
  @ApiSuccessResponse(DocumentResponseDto, {
    message: 'DOCUMENT.UPLOADED',
    description:
      'What the storage holds is the file that was declared: it now waits for its owner and only its uploader sees it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    ROLES,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The upload is done already (DOCUMENT.NOT_AWAITING_UPLOAD), has not reached the storage yet and can be said again (DOCUMENT.UPLOAD_PENDING), or never came in a day and was given up (DOCUMENT.UPLOAD_EXPIRED).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id is invalid (VALIDATION_ERROR) or the stored file is not what was declared (DOCUMENT.UPLOAD_MISMATCH): the object is deleted and the document quarantined.',
    },
  )
  async complete(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { document: toWire(await this.documents.complete(actor, params.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Post(':id/attach')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'documentAttach', summary: 'Attach an uploaded file to a contract' })
  @ApiSuccessResponse(DocumentResponseDto, {
    message: 'DOCUMENT.ATTACHED',
    description:
      'The file belongs to the contract for good, and the IT Admin and Finance open it. Only its uploader attaches it, and only once.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: ROLES.description },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        "The document is not the uploader's (DOCUMENT.NOT_FOUND) or the contract does not exist (CONTRACT.NOT_FOUND).",
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The document has an owner already (DOCUMENT.ALREADY_ATTACHED) or is not uploaded (DOCUMENT.NOT_READY_TO_ATTACH).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The request is invalid (VALIDATION_ERROR).' },
  )
  async attach(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: AttachDocumentBodyDto,
  ) {
    try {
      return { document: toWire(await this.documents.attach(actor, params.id, body)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'documentGet', summary: 'Get what is known of a file' })
  @ApiSuccessResponse(DocumentResponseDto, {
    message: 'DOCUMENT.FETCHED',
    description: "The file as declared, its state and its owner. A file not attached yet is its uploader's alone.",
  })
  @ApiErrorResponses(...AUTH_ERRORS, ROLES, NOT_FOUND, INVALID_ID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { document: toWire(await this.documents.get(actor, params.id)) };
    } catch (error) {
      throw toContractApiException(error);
    }
  }

  @Post(':id/links')
  @Header('Cache-Control', 'no-store')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'documentLink', summary: 'Get a link that opens a file for five minutes' })
  @ApiSuccessResponse(DocumentLinkResponseDto, {
    message: 'DOCUMENT.LINK_ISSUED',
    description:
      'A link valid for five minutes, kept nowhere: it opens the file as a download under its own name and type, and the response is never cached. Every request is one more link and one more event of the audit trail, which does not hold the link.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, ROLES, NOT_FOUND, INVALID_ID)
  async link(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      const { url, expiresAt } = await this.documents.link(actor, params.id);

      return { url, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      throw toContractApiException(error);
    }
  }
}
