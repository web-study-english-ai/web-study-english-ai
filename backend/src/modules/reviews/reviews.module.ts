import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { AiSchedulerClient } from './ai-scheduler.client';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, AiSchedulerClient],
})
export class ReviewsModule {}
