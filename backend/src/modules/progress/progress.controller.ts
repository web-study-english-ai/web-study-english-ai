import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Lấy dữ liệu thống kê tiến trình học tập cá nhân' })
  @ApiResponse({ status: 200, description: 'Dữ liệu thống kê tiến độ học tập' })
  getStats(@CurrentUser('id') userId: string) {
    return this.progressService.getStats(userId);
  }
}
