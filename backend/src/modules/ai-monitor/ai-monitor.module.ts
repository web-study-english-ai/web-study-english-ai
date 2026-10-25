import { Global, Module } from '@nestjs/common';
import { AiMonitorService } from './ai-monitor.service';
import { AiMonitorController } from './ai-monitor.controller';

@Global()
@Module({
  controllers: [AiMonitorController],
  providers: [AiMonitorService],
  exports: [AiMonitorService],
})
export class AiMonitorModule {}
