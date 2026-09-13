import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { VocabularyService } from './vocabulary.service';
import { ListWordsDto } from './dto/list-words.dto';

@ApiTags('vocabulary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('topics')
  @ApiOperation({ summary: 'Danh sách chủ đề từ vựng' })
  listTopics() {
    return this.vocabularyService.listTopics();
  }

  @Get('words')
  @ApiOperation({ summary: 'Danh sách từ vựng có phân trang, tìm kiếm và lọc' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'book' })
  @ApiQuery({ name: 'cefr', required: false, enum: ['A1', 'A2', 'B1', 'B2'] })
  @ApiQuery({ name: 'topicId', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['rank', 'term'] })
  @ApiResponse({ status: 400, description: 'Tham số truy vấn không hợp lệ' })
  listWords(@Query() query: ListWordsDto) {
    return this.vocabularyService.listWords(query);
  }

  @Get('words/:id')
  @ApiOperation({ summary: 'Chi tiết một từ vựng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy từ' })
  getWord(@Param('id', ParseUUIDPipe) id: string) {
    return this.vocabularyService.getWordById(id);
  }
}
