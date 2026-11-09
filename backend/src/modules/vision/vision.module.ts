import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';
import { VisionAiClient } from './vision-ai.client';
import { VisionStorageService } from './vision-storage.service';
@Module({
  controllers: [VisionController],
  providers: [VisionService, VisionAiClient, VisionStorageService],
  exports: [VisionService, VisionStorageService],
})
export class VisionModule {}
