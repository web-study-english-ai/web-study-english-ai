import { Global, Module } from '@nestjs/common';
import { InfraResilienceService } from './infra-resilience.service';
import { InfraResilienceController } from './infra-resilience.controller';

@Global()
@Module({
  controllers: [InfraResilienceController],
  providers: [InfraResilienceService],
  exports: [InfraResilienceService],
})
export class InfraResilienceModule {}
