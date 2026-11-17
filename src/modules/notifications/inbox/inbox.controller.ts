import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import {
  RequestLocale,
  type RequestLocaleValue,
} from '../../../infrastructure/http/decorators/request-locale.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  NotificationIdParamDto,
  NotificationListQueryDto,
  NotificationListResponseDto,
  NotificationResponseDto,
  NotificationsMarkedResponseDto,
  NotificationUnreadCountResponseDto,
} from './inbox.dto';
import { INBOX_ERROR_EXAMPLES, toInboxApiException } from './inbox.http-errors';
import { toNotificationWire } from './inbox.mapper';
import { InboxService } from './inbox.service';
import { InboxViewService } from './inbox-view.service';

const ACCEPT_LANGUAGE = {
  name: 'Accept-Language',
  required: false,
  description:
    'The language of the title and the message: vi or en, by the usual ranking of the header. Anything else, or no header, gives vi.',
} as const;

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * The inbox of the application: the notices the caller was told, and only theirs. Every route reads the caller from the
 * session, never from a parameter, so nobody reads another person's inbox, the Super Admin included. Web and mobile call the
 * same routes and get the same notices: nothing in the answer depends on the client.
 */
@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly view: InboxViewService,
  ) {}

  @Get()
  @AuthenticatedOnly()
  @ApiHeader(ACCEPT_LANGUAGE)
  @ApiOperation({ operationId: 'notificationList', summary: 'List the notifications of the caller' })
  @ApiSuccessResponse(NotificationListResponseDto, {
    message: 'NOTIFICATION.LISTED',
    description:
      'The notifications of the caller, the newest first, optionally only the unread ones. Each carries a code, what it is about by id, flat parameters, a title and a message in the language of Accept-Language, and the read route it opens.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: NotificationListQueryDto,
    @RequestLocale() locale: RequestLocaleValue,
  ) {
    try {
      const page = await this.inbox.list(actor.employeeId, query);

      return {
        items: (await this.view.view(page.items, locale, actor.employeeId)).map(toNotificationWire),
        pagination: page.pagination,
      };
    } catch (error) {
      throw toInboxApiException(error);
    }
  }

  @Get('unread-count')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'notificationUnreadCount', summary: 'Count the unread notifications of the caller' })
  @ApiSuccessResponse(NotificationUnreadCountResponseDto, {
    message: 'NOTIFICATION.UNREAD_COUNTED',
    description: 'How many notifications of the caller are still unread.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async unreadCount(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      return { unread: await this.inbox.unreadCount(actor.employeeId) };
    } catch (error) {
      throw toInboxApiException(error);
    }
  }

  @Post('read-all')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'notificationMarkAllRead', summary: 'Mark every notification of the caller as read' })
  @ApiSuccessResponse(NotificationsMarkedResponseDto, {
    message: 'NOTIFICATION.ALL_READ',
    description:
      'Marks every unread notification of the caller as read and says how many changed. Calling it again changes none.',
  })
  @ApiErrorResponses(...AUTH_ERRORS)
  async markAllRead(@CurrentPrincipal() actor: AuthenticatedPrincipal) {
    try {
      return { updated: await this.inbox.markAllRead(actor.employeeId) };
    } catch (error) {
      throw toInboxApiException(error);
    }
  }

  @Post(':id/read')
  @AuthenticatedOnly()
  @ApiHeader(ACCEPT_LANGUAGE)
  @ApiOperation({ operationId: 'notificationMarkRead', summary: 'Mark one notification as read' })
  @ApiSuccessResponse(NotificationResponseDto, {
    message: 'NOTIFICATION.READ',
    description:
      'Marks one notification of the caller as read. The moment it was read is written once: calling it again returns the notification as it is, with the same moment.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The notification does not exist or is not in the inbox of the caller (NOTIFICATION.NOT_FOUND).',
      examples: [INBOX_ERROR_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async markRead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NotificationIdParamDto,
    @RequestLocale() locale: RequestLocaleValue,
  ) {
    try {
      const [view] = await this.view.view(
        [await this.inbox.markRead(actor.employeeId, params.id)],
        locale,
        actor.employeeId,
      );

      return { notification: toNotificationWire(view) };
    } catch (error) {
      throw toInboxApiException(error);
    }
  }
}
