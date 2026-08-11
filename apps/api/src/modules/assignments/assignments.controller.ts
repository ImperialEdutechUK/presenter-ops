import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignmentQuerySchema,
  commentSchema,
  createAssignmentSchema,
  timeLogSchema,
  transitionAssignmentSchema,
  updateAssignmentSchema,
  type AssignmentQuery,
} from '@presenter-ops/shared';

import { AssignmentsService } from './assignments.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';

@ApiTags('assignments')
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  list(
    @Query(zodQuery(assignmentQuerySchema)) query: AssignmentQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.findMany(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignments.findOne(id, user);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Audit('assignment.created')
  @Post()
  async create(
    @Body(zodBody(createAssignmentSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.assignments.create(body, user);
    // "Create and send" is one action for the user; two for the state machine.
    if (body.sendImmediately) {
      return this.assignments.transition(created.id, 'ASSIGNED', user);
    }
    return created;
  }

  @Roles('ADMIN', 'PRODUCER', 'PRESENTER')
  @Audit('assignment.updated')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateAssignmentSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.update(id, body, user);
  }

  @Audit('assignment.transitioned')
  @Post(':id/transition')
  transition(
    @Param('id') id: string,
    @Body(zodBody(transitionAssignmentSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.transition(id, body.to, user, {
      deliveryUrl: body.deliveryUrl,
      note: body.note,
    });
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body(zodBody(commentSchema)) body: { body: string; isInternal: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.addComment(id, body.body, body.isInternal, user);
  }

  @Post(':id/time-logs')
  logTime(
    @Param('id') id: string,
    @Body(zodBody(timeLogSchema)) body: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.logTime(id, body, user);
  }
}
