import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { feedbackSchema } from '@presenter-ops/shared';

import { FeedbackService } from './feedback.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';

@ApiTags('feedback')
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Roles('ADMIN', 'PRODUCER', 'MARKETING')
  @Audit('feedback.saved')
  @Post('assignments/:id/feedback')
  upsert(
    @Param('id') id: string,
    @Body(zodBody(feedbackSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedback.upsert(id, body, user);
  }

  @Get('presenters/:id/feedback')
  list(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('onlyShared') onlyShared?: string,
  ) {
    // A presenter sees only what has been explicitly shared with them.
    const restrict = user.role === 'PRESENTER' || onlyShared === 'true';
    return this.feedback.listForPresenter(id, restrict);
  }

  @Get('presenters/:id/feedback/averages')
  averages(@Param('id') id: string) {
    return this.feedback.dimensionAverages(id);
  }
}
