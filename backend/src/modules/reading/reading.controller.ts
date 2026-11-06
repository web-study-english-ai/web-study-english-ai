import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ReadingService } from './reading.service';
import { AttemptReadingDto } from './dto/attempt-reading.dto';
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

  @Get('history')
  @ApiOperation({ summary: 'Lịch sử các lượt hoàn thành bài đọc hiểu của tôi' })
  @ApiResponse({ status: 200, description: 'Danh sách lịch sử làm bài đọc hiểu mới nhất trước' })
  listHistory(@CurrentUser('id') userId: string) {
    return this.readingService.listHistory(userId);
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

  @Put(':id/draft')
  @ApiOperation({ summary: 'Lưu tiến độ làm bài đọc hiểu đang dở (bản nháp)' })
  @ApiResponse({ status: 200, description: 'Đã lưu tiến độ làm bài' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài đọc' })
  saveDraft(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttemptReadingDto,
  ) {
    return this.readingService.saveDraft(userId, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Nộp bài đọc hiểu, chấm điểm và trả về đáp án đúng kèm giải thích chi tiết',
  })
  @ApiResponse({
    status: 200,
    description: 'Kết quả chấm điểm, đáp án đúng và giải thích từng câu',
  })
  @ApiResponse({ status: 400, description: 'Chưa trả lời đủ câu hỏi hoặc lựa chọn không hợp lệ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài đọc' })
  submitReading(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttemptReadingDto,
  ) {
    return this.readingService.submitReading(userId, id, dto);
  }

  @Get(':id/attempts')
  @ApiOperation({ summary: 'Lịch sử các lần nộp bài của một bài đọc cụ thể' })
  @ApiResponse({ status: 200, description: 'Danh sách các lần làm bài đọc này' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy bài đọc' })
  listPassageAttempts(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.readingService.listHistory(userId, id);
  }
}
