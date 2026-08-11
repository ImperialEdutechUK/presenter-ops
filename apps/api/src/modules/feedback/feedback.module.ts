import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { PresentersModule } from '../presenters/presenters.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PresentersModule, NotificationsModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
