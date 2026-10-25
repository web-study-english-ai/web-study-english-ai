import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiMonitorService } from './ai-monitor.service';
import { RecordCallDto } from './dto/record-call.dto';

class CircuitBreakerDto {
  open: boolean;
}

@ApiTags('ai-monitor')
@Controller('ai-monitor')
export class AiMonitorController {
  constructor(private readonly aiMonitorService: AiMonitorService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Báo cáo tổng hợp số lượt gọi, chi phí token và đối soát ngân sách (WSEA-138)' })
  @ApiResponse({ status: 200, description: 'Trả về toàn bộ thống kê chi phí, hạn mức và cảnh báo' })
  getSummary() {
    return this.aiMonitorService.getSummary();
  }

  @Get('resources')
  @ApiOperation({ summary: 'Giám sát tài nguyên máy chủ và tình trạng kết nối tới AI Microservice' })
  @ApiResponse({ status: 200, description: 'Thông số RAM, CPU và độ trễ Hugging Face Spaces' })
  getResources() {
    return this.aiMonitorService.getSystemResources();
  }

  @Post('record-call')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ghi nhận một lượt gọi AI Service / LLM (Dùng cho Client/Interceptor)' })
  recordCall(@Body() dto: RecordCallDto) {
    this.aiMonitorService.recordCall(dto);
    return {
      success: true,
      message: 'Đã ghi nhận lượt gọi AI thành công',
      circuitBreakerOpen: this.aiMonitorService.isCircuitBreakerOpen(),
    };
  }

  @Post('circuit-breaker')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bật/tắt cưỡng bức Circuit Breaker để kiểm thử kịch bản ngắt vượt ngân sách' })
  setCircuitBreaker(@Body() body: CircuitBreakerDto) {
    const state = this.aiMonitorService.setManualCircuitBreaker(Boolean(body.open));
    return {
      success: true,
      circuitBreakerOpen: state,
      message: state
        ? 'Đã kích hoạt ngắt Circuit Breaker: Chuyển toàn bộ cuộc gọi AI sang fallback offline'
        : 'Đã khôi phục Circuit Breaker: Cho phép kết nối dịch vụ AI bình thường',
    };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại toàn bộ số liệu thống kê (Phục vụ Test / Reset chu kỳ tháng)' })
  resetMetrics() {
    this.aiMonitorService.resetMetrics();
    return {
      success: true,
      message: 'Đã đặt lại toàn bộ số liệu đo lường chi phí',
    };
  }
}
