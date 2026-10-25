import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';
import { VocabularyModule } from '@modules/vocabulary/vocabulary.module';
import { CardsModule } from '@modules/cards/cards.module';
import { DictionaryModule } from '@modules/dictionary/dictionary.module';
import { HealthModule } from '@modules/health/health.module';
import { ReviewsModule } from '@modules/reviews/reviews.module';
import { ProgressModule } from '@modules/progress/progress.module';
import { AssistantModule } from '@modules/assistant/assistant.module';
import { ReadingModule } from '@modules/reading/reading.module';
import { AiMonitorModule } from '@modules/ai-monitor/ai-monitor.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AiMonitorModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    VocabularyModule,
    CardsModule,
    DictionaryModule,
    HealthModule,
    ReviewsModule,
    ProgressModule,
    AssistantModule,
    ReadingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
