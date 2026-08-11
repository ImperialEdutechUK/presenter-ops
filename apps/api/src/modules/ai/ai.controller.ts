import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { aiBriefFromScriptSchema, aiSummariseFeedbackSchema } from '@presenter-ops/shared';

import { AiService } from './ai.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** The web app hides every AI affordance when this returns false. */
  @Get('status')
  status() {
    return { enabled: this.ai.enabled };
  }

  @Roles('ADMIN', 'PRODUCER', 'MARKETING')
  @Audit('ai.brief_drafted')
  @Post('brief-from-script')
  brief(
    @Body(zodBody(aiBriefFromScriptSchema)) body: { assignmentId: string; attachmentId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ai.briefFromScript(body.assignmentId, body.attachmentId, user);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Audit('ai.feedback_summarised')
  @Post('summarise-feedback')
  summarise(
    @Body(zodBody(aiSummariseFeedbackSchema)) body: { presenterId: string; months: number },
  ) {
    return this.ai.summariseFeedback(body.presenterId, body.months);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Post('draft-assignment-message')
  draftMessage(@Body() body: { assignmentId: string }) {
    return this.ai.draftAssignmentMessage(body.assignmentId);
  }
}
