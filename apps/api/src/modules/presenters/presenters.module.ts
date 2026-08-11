import { Module } from '@nestjs/common';
import { PresentersController } from './presenters.controller';
import { PresentersService } from './presenters.service';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';

@Module({
  imports: [TaxonomyModule],
  controllers: [PresentersController],
  providers: [PresentersService],
  exports: [PresentersService],
})
export class PresentersModule {}
