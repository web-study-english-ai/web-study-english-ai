import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kiểm tra sức khoẻ hệ thống và kết nối cơ sở dữ liệu' })
  @ApiResponse({ status: 200, description: 'Hệ thống hoạt động bình thường' })
  @ApiResponse({ status: 503, description: 'Cơ sở dữ liệu hoặc dịch vụ bị gián đoạn' })
  check() {
    return this.healthService.check();
  }

  @Get('sentry-test')
  @ApiOperation({ summary: 'Endpoint thử nghiệm kích hoạt lỗi và ghi nhận lên Sentry (WSEA-80)' })
  sentryTest() {
    const error = new Error(
      'WSEA-80: Thử nghiệm kích hoạt lỗi giám sát Sentry Backend thành công!',
    );
    Sentry.captureException(error);
    return {
      message: 'Đã kích hoạt và gửi lỗi thử nghiệm lên Sentry',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}
