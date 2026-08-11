import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { PresentersModule } from '../presenters/presenters.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TaxonomyModule, PresentersModule, NotificationsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
