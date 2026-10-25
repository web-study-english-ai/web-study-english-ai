import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ReadingService } from './reading.service';
import { ListReadingsDto } from './dto/list-readings.dto';

@ApiTags('reading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reading')
export class ReadingController {
  constructor(private readonly readingService: ReadingService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách bài đọc hiểu (hỗ trợ tìm kiếm, lọc theo bậc CEFR, chủ đề, trạng thái)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách bài đọc kèm trạng thái làm bài và phân trang',
  })
  listReadings(@CurrentUser('id') userId: string, @Query() query: ListReadingsDto) {
    return this.readingService.listReadings(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết bài đọc hiểu kèm danh sách câu hỏi (ẩn đáp án đúng trước khi nộp bài)',
  })
  @ApiResponse({ status: 200, description: 'Chi tiết bài đọc, câu hỏi và bản nháp đang làm dở' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài đọc' })
  getReadingById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.readingService.getReadingById(userId, id);
  }
}
