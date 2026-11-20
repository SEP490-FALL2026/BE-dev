import {
  Body,
  Controller,
  Delete,
  Header,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  fallbackExample,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AppUserIdParamDto,
  AvatarResultResponseDto,
  EmployeeProfileLookupBodyDto,
  EmployeeProfileLookupResponseDto,
  RemoveAvatarBodyDto,
  WorkPhoneBodyDto,
  WorkPhoneResultResponseDto,
} from './profile.dto';
import { PROFILE_ERROR_EXAMPLES as EXAMPLES, toProfileApiException } from './profile.http-errors';
import { PICTURE_MAX_BYTES as AVATAR_MAX_BYTES } from '../../../infrastructure/object-storage/picture-image';
import { ProfileAvatarService } from './profile-avatar.service';
import { ProfilePhoneService } from './profile-phone.service';
import { ProfileQueryService } from './profile-query.service';

/**
 * One file and nothing else. The limit is a byte over the policy's, so a file that is only a little too large is told by the policy
 * (PROFILE.AVATAR_TOO_LARGE); the parser stops anything larger at once and answers 413 HTTP_PAYLOAD_TOO_LARGE, which the route declares too.
 */
const UPLOAD_LIMITS = { fileSize: AVATAR_MAX_BYTES + 1, files: 1, fields: 0, parts: 1 };

interface UploadedBinary {
  buffer: Buffer;
  mimetype: string;
}

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** What a person edits on their own account and what everyone reads of it: the picture and the work phone (`QĐ-111at`, `QĐ-111au`). */
@ApiTags('profile')
@Controller({ version: '1' })
export class ProfileController {
  constructor(
    private readonly avatars: ProfileAvatarService,
    private readonly phones: ProfilePhoneService,
    private readonly queries: ProfileQueryService,
  ) {}

  @Put('me/avatar')
  @Header('Cache-Control', 'no-store')
  @AuthenticatedOnly()
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiOperation({ operationId: 'meAvatarPut', summary: 'Set my picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiSuccessResponse(AvatarResultResponseDto, {
    message: 'PROFILE.AVATAR_CHANGED',
    description:
      'The picture was stored and the account points at it; the link works for a few minutes. The picture before it, if any, is deleted shortly after.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.BAD_REQUEST,
      description: 'The form is not a readable multipart form with one file (HTTP_BAD_REQUEST).',
      examples: [fallbackExample(HttpStatus.BAD_REQUEST)],
    },
    {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      description:
        'The picture is larger than 1 MiB: PROFILE.AVATAR_TOO_LARGE for one a little over it, HTTP_PAYLOAD_TOO_LARGE for any larger one, which the parser stops at once (1 MiB).',
      examples: [EXAMPLES.TOO_LARGE, fallbackExample(HttpStatus.PAYLOAD_TOO_LARGE)],
    },
    {
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      description: 'By its first bytes the file is not a png, jpeg or webp (PROFILE.AVATAR_TYPE_UNSUPPORTED).',
      examples: [EXAMPLES.TYPE_UNSUPPORTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'No file was sent (PROFILE.AVATAR_FILE_REQUIRED), it is empty (PROFILE.AVATAR_EMPTY) or it is not the type it says it is (PROFILE.AVATAR_TYPE_MISMATCH).',
      examples: [EXAMPLES.FILE_REQUIRED, EXAMPLES.EMPTY, EXAMPLES.TYPE_MISMATCH],
    },
  )
  async setAvatar(@CurrentPrincipal() actor: AuthenticatedPrincipal, @UploadedFile() file: UploadedBinary | undefined) {
    try {
      return await this.avatars.upload(
        actor,
        file ? { bytes: file.buffer, declaredContentType: file.mimetype } : undefined,
      );
    } catch (error) {
      throw toProfileApiException(error);
    }
  }

  @Delete('me/avatar')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meAvatarDelete', summary: 'Remove my picture' })
  @ApiSuccessResponse(AvatarResultResponseDto, {
    message: 'PROFILE.AVATAR_REMOVED',
    description: 'The account has no picture now; with none to begin with, nothing changed.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async removeAvatar(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      return await this.avatars.remove(actor);
    } catch (error) {
      throw toProfileApiException(error);
    }
  }

  @Patch('me/profile')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meProfilePatch', summary: 'Change my work phone' })
  @ApiSuccessResponse(WorkPhoneResultResponseDto, {
    message: 'PROFILE.WORK_PHONE_CHANGED',
    description: 'The work phone as it is kept, digits with an optional leading plus; null when it was cleared.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The request is invalid (VALIDATION_ERROR) or the number is not 8 to 15 digits (PROFILE.WORK_PHONE_INVALID).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.PHONE_INVALID],
  })
  async changePhone(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: WorkPhoneBodyDto) {
    try {
      return await this.phones.change(actor, body.workPhone);
    } catch (error) {
      throw toProfileApiException(error);
    }
  }

  @Post('employee-profiles/lookup')
  @Header('Cache-Control', 'no-store')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'employeeProfileLookup', summary: 'Read the picture and work phone of employees' })
  @ApiSuccessResponse(EmployeeProfileLookupResponseDto, {
    status: HttpStatus.OK,
    message: 'PROFILE.LOOKED_UP',
    description:
      'One entry for each employee asked for, in the order asked and each once: the picture as a link that expires, and the work phone; both null for a person with none. The usage and discovery routes never carry them.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The request is invalid (VALIDATION_ERROR): no id, more than 100, or an id that is not a UUID.',
    examples: [VALIDATION_EXAMPLE],
  })
  async lookup(@Body() body: EmployeeProfileLookupBodyDto) {
    try {
      return { items: await this.queries.lookup(body.employeeIds) };
    } catch (error) {
      throw toProfileApiException(error);
    }
  }

  @Delete('app-users/:id/avatar')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'appUserAvatarDelete', summary: 'Remove the picture of an account' })
  @ApiSuccessResponse(AvatarResultResponseDto, {
    message: 'PROFILE.AVATAR_REMOVED_BY_ADMIN',
    description:
      'The picture was removed for the reason given, which is kept in the audit trail; the object is deleted shortly after.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin.', examples: [FORBIDDEN_EXAMPLE] },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No such account (APP_USER.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The account has no picture (PROFILE.AVATAR_NOT_SET).',
      examples: [EXAMPLES.NOT_SET],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR): the reason is required.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async removeByAdmin(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AppUserIdParamDto,
    @Body() body: RemoveAvatarBodyDto,
  ) {
    try {
      return await this.avatars.removeByAdmin(actor, params.id, body.reason);
    } catch (error) {
      throw toProfileApiException(error);
    }
  }
}
