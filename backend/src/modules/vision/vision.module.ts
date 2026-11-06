import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { VisionAiClient } from './vision-ai.client';

@Module({
  controllers: [VisionController],
  providers: [VisionService, VisionAiClient],
  exports: [VisionService],
})
export class VisionModule {}
