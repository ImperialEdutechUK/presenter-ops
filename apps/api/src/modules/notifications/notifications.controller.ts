import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(user.id, unreadOnly === 'true');
  }

  @Post('read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: { ids?: string[] }) {
    return this.notifications.markRead(user.id, body?.ids);
  }
}
