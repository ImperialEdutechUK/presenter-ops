import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenRouterClient } from './openrouter.client';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [AiController],
  providers: [AiService, OpenRouterClient],
  exports: [AiService],
})
export class AiModule {}
