import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  availabilitySchema,
  createPresenterSchema,
  presenterContractSchema,
  presenterQuerySchema,
  updatePresenterSchema,
  type PresenterQuery,
} from '@presenter-ops/shared';

import { PresentersService } from './presenters.service';
import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';

@ApiTags('presenters')
@Controller('presenters')
export class PresentersController {
  constructor(private readonly presenters: PresentersService) {}

  @Roles('ADMIN', 'PRODUCER', 'MARKETING', 'FINANCE', 'VIEWER')
  @Get()
  list(@Query(zodQuery(presenterQuerySchema)) query: PresenterQuery) {
    return this.presenters.findMany(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.presenters.findOne(id, user);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Audit('presenter.created')
  @Post()
  create(@Body(zodBody(createPresenterSchema)) body: any) {
    return this.presenters.create(body);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Audit('presenter.updated')
  @Patch(':id')
  update(@Param('id') id: string, @Body(zodBody(updatePresenterSchema)) body: any) {
    return this.presenters.update(id, body);
  }

  // --- contracts -----------------------------------------------------------

  @Roles('ADMIN', 'PRODUCER')
  @Audit('presenter.contract_saved')
  @Post(':id/contracts')
  upsertContract(@Param('id') id: string, @Body(zodBody(presenterContractSchema)) body: any) {
    return this.presenters.upsertContract(id, body);
  }

  @Roles('ADMIN', 'PRODUCER')
  @Audit('presenter.contract_removed')
  @Delete(':id/contracts/:contractId')
  removeContract(@Param('id') id: string, @Param('contractId') contractId: string) {
    return this.presenters.removeContract(id, contractId);
  }

  // --- availability --------------------------------------------------------

  @Post(':id/availability')
  addAvailability(@Param('id') id: string, @Body(zodBody(availabilitySchema)) body: any) {
    return this.presenters.addAvailability(id, body);
  }

  @Delete(':id/availability/:availabilityId')
  removeAvailability(@Param('availabilityId') availabilityId: string) {
    return this.presenters.removeAvailability(availabilityId);
  }

  // --- maintenance ---------------------------------------------------------

  @Roles('ADMIN')
  @Post(':id/recompute-stats')
  recompute(@Param('id') id: string) {
    return this.presenters.recomputeStats(id).then(() => ({ ok: true }));
  }
}
