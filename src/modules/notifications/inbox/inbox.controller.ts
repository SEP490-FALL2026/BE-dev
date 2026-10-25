import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { InAppNotificationRecord } from '../notifications.types';
import {
  NotificationIdParamDto,
  NotificationListQueryDto,
  NotificationListResponseDto,
  NotificationResponseDto,
  NotificationsMarkedResponseDto,
  NotificationUnreadCountResponseDto,
  type NotificationWire,
} from './inbox.dto';
import { toInboxApiException } from './inbox.http-errors';
import { InboxService } from './inbox.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

function wireOf(record: InAppNotificationRecord): NotificationWire {
  return {
    id: record.id,
    code: record.code,
    subject:
      record.subjectType !== null && record.subjectId !== null
        ? { type: record.subjectType, id: record.subjectId }
        : null,
    params: record.params,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}

/**
 * The inbox of the application: the notices the caller was told, and only theirs. Every route reads the caller from the
 * session, never from a parameter, so nobody reads another person's inbox, the Super Admin included. Web and mobile call the
 * same routes and get the same notices: nothing in the answer depends on the client.
 */
@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'notificationList', summary: 'List the notifications of the caller' })
  @ApiSuccessResponse(NotificationListResponseDto, {
    message: 'NOTIFICATION.LISTED',
    description:
      'The notifications of the caller, the newest first, optionally only the unread ones. Each carries a code, what it is about by id and flat parameters; the client turns them into words.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: NotificationListQueryDto) {
    try {
      const page = await this.inbox.list(actor.employeeId, query);

      return { items: page.items.map(wireOf), pagination: page.pagination };
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
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is invalid (VALIDATION_ERROR).' },
  )
  async markRead(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: NotificationIdParamDto) {
    try {
      return { notification: wireOf(await this.inbox.markRead(actor.employeeId, params.id)) };
    } catch (error) {
      throw toInboxApiException(error);
    }
  }
}
