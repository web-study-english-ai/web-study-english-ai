import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AssistantService } from './assistant.service';
import { AskAssistantDto } from './dto/ask-assistant.dto';

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('ask')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hỏi trợ lý ngữ pháp, trả về câu trả lời kèm nguồn tri thức' })
  @ApiResponse({ status: 200, description: 'degraded = true khi dịch vụ AI không trả lời được' })
  ask(@CurrentUser('id') userId: string, @Body() dto: AskAssistantDto) {
    return this.assistantService.ask(userId, dto);
  }
}
