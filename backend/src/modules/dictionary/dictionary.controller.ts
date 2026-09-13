import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { DictionaryService } from './dictionary.service';

@ApiTags('dictionary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Get(':term')
  @ApiOperation({ summary: 'Tra phiên âm, phát âm và định nghĩa của một từ' })
  @ApiResponse({
    status: 200,
    description: 'Trả dữ liệu từ điển; available=false khi không có dữ liệu',
  })
  lookup(@Param('term') term: string) {
    return this.dictionaryService.lookup(term);
  }
}
