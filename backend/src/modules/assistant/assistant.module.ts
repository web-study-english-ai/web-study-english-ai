import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantClient } from './assistant.client';

@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantClient],
})
export class AssistantModule {}
