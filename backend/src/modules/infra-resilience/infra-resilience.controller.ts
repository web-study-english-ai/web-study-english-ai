import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InfraResilienceService } from './infra-resilience.service';

class TripCircuitDto {
  reason?: string;
}

@ApiTags('infra-resilience')
@Controller('infra-resilience')
export class InfraResilienceController {
  constructor(private readonly resilienceService: InfraResilienceService) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Báo cáo trạng thái bộ đệm sự cố hạ tầng: Circuit Breaker, Retries, Concurrency (WSEA-139)',
  })
  @ApiResponse({
    status: 200,
    description: 'Trả về thông tin chi tiết về trạng thái rào chắn và bộ đệm',
  })
  getStatus() {
    return this.resilienceService.getTelemetry();
  }

  @Post('warmup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Kích hoạt làm ấm dịch vụ AI (Warm-up Buffer) ngăn chặn sự cố Cold Start trên Hugging Face',
  })
  warmup() {
    return this.resilienceService.warmupAiService();
  }

  @Post('circuit-breaker/trip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bật cưỡng bức trạng thái ngắt Circuit Breaker để diễn tập kịch bản sự cố hạ tầng',
  })
  tripCircuit(@Body() body: TripCircuitDto) {
    this.resilienceService.tripCircuit(body.reason);
    return {
      success: true,
      circuitState: 'OPEN',
      message:
        'Đã kích hoạt ngắt Circuit Breaker cưỡng bức. Mọi yêu cầu gọi ngoài sẽ rơi về dự phòng offline (0ms).',
    };
  }

  @Post('circuit-breaker/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khôi phục trạng thái Circuit Breaker về CLOSED sau khi khắc phục sự cố',
  })
  resetCircuit() {
    this.resilienceService.resetCircuit();
    return {
      success: true,
      circuitState: 'CLOSED',
      message:
        'Đã khôi phục trạng thái Circuit Breaker. Cho phép kết nối dịch vụ ngoài bình thường.',
    };
  }

  @Post('reset-metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đặt lại các bộ đếm đo lường phục vụ kiểm thử chu kỳ mới',
  })
  resetMetrics() {
    this.resilienceService.resetMetrics();
    return {
      success: true,
      message: 'Đã đặt lại toàn bộ bộ đếm đo lường sự cố hạ tầng.',
    };
  }
}
