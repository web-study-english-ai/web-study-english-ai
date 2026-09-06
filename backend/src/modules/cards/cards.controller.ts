import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CardsService } from './cards.service';
import { AddCardsDto } from './dto/add-cards.dto';
import { ListCardsDto } from './dto/list-cards.dto';
import { ListDueCardsDto } from './dto/list-due-cards.dto';

@ApiTags('cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @ApiOperation({ summary: 'Thêm một hoặc nhiều từ vào bộ thẻ cá nhân' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy từ vựng' })
  @ApiResponse({
    status: 409,
    description: 'Vượt hạn mức từ mới trong ngày, gửi lại với force=true để tiếp tục',
  })
  addCards(@CurrentUser('id') userId: string, @Body() dto: AddCardsDto) {
    return this.cardsService.addCards(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách thẻ của tôi, có phân trang' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'state', required: false, enum: ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'] })
  listCards(@CurrentUser('id') userId: string, @Query() query: ListCardsDto) {
    return this.cardsService.listCards(userId, query);
  }

  @Get('new')
  @ApiOperation({ summary: 'Thẻ chưa học, giới hạn theo hạn mức từ mới mỗi ngày' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  listNewCards(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.cardsService.listNewCards(userId, limit ? Number(limit) : undefined);
  }

  @Get('due')
  @ApiOperation({ summary: 'Thẻ đã đến hạn ôn, sắp theo thứ tự ưu tiên' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  listDueCards(@CurrentUser('id') userId: string, @Query() query: ListDueCardsDto) {
    return this.cardsService.listDueCards(userId, query);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Bỏ một từ khỏi bộ thẻ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy thẻ' })
  removeCard(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.cardsService.removeCard(userId, id);
  }
}
