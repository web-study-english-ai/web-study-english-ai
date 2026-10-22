import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';
import {
  DayDetailResponseDto,
  GetDayDetailQueryDto,
  GetProgressStatsQueryDto,
  ProgressStatsResponseDto,
} from './dto/progress-stats.dto';

@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Lấy dữ liệu thống kê tiến trình học tập cá nhân' })
  @ApiQuery({
    name: 'range',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Khoảng thời gian hiển thị (mặc định: week)',
  })
  @ApiResponse({
    status: 200,
    description: 'Dữ liệu thống kê tiến độ học tập',
    type: ProgressStatsResponseDto,
  })
  getStats(@CurrentUser('id') userId: string, @Query() query: GetProgressStatsQueryDto) {
    return this.progressService.getStats(userId, query.range);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Lấy chi tiết hoạt động học từ mới và ôn tập theo ngày cụ thể' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Ngày cần xem chi tiết (định dạng YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết từ mới và ôn tập trong ngày',
    type: DayDetailResponseDto,
  })
  getDayDetail(@CurrentUser('id') userId: string, @Query() query: GetDayDetailQueryDto) {
    return this.progressService.getDayDetail(userId, query.date);
  }
}
