import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { upsertBrandSchema, upsertWorkTypeSchema } from '@presenter-ops/shared';

import { TaxonomyService } from './taxonomy.service';
import { Roles } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';

@ApiTags('taxonomy')
@Controller()
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  // --- brands --------------------------------------------------------------

  @Get('brands')
  listBrands(@Query('q') q?: string, @Query('includeInactive') includeInactive?: string) {
    return this.taxonomy.listBrands({
      q,
      includeInactive: includeInactive === 'true',
    });
  }

  @Roles('ADMIN', 'PRODUCER')
  @Post('brands')
  createBrand(@Body(zodBody(upsertBrandSchema)) body: { name: string }) {
    return this.taxonomy.resolveBrand({ name: body.name }).then((id) =>
      this.taxonomy.updateBrand(id, body),
    );
  }

  @Roles('ADMIN', 'PRODUCER')
  @Patch('brands/:id')
  updateBrand(
    @Param('id') id: string,
    @Body(zodBody(upsertBrandSchema.partial())) body: Record<string, unknown>,
  ) {
    return this.taxonomy.updateBrand(id, body);
  }

  @Roles('ADMIN')
  @Delete('brands/:id')
  archiveBrand(@Param('id') id: string) {
    return this.taxonomy.archiveBrand(id);
  }

  @Roles('ADMIN')
  @Post('brands/:id/merge-into/:targetId')
  merge(@Param('id') id: string, @Param('targetId') targetId: string) {
    return this.taxonomy.mergeBrands(id, targetId);
  }

  // --- work types ----------------------------------------------------------

  @Get('work-types')
  listWorkTypes(@Query('includeInactive') includeInactive?: string) {
    return this.taxonomy.listWorkTypes(includeInactive === 'true');
  }

  @Roles('ADMIN', 'PRODUCER')
  @Post('work-types')
  createWorkType(@Body(zodBody(upsertWorkTypeSchema)) body: { name: string }) {
    return this.taxonomy.resolveWorkType({ name: body.name });
  }

  // --- tags ----------------------------------------------------------------

  @Get('tags')
  listTags(@Query('q') q?: string) {
    return this.taxonomy.listTags(q);
  }
}