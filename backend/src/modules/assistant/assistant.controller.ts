import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
  ask(@CurrentUser('id') userId: string, @Body() dto: AskAssistantDto, @Req() req: Request) {
    const abortController = new AbortController();
    req.on('close', () => {
      if (!req.complete) abortController.abort();
    });

    return this.assistantService.ask(userId, dto, abortController.signal);
  }

  @Post('ask/stream')
  @HttpCode(200)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Hỏi trợ lý ngữ pháp theo luồng SSE (Server-Sent Events)',
    description:
      'Phát các sự kiện `delta` chứa từng đoạn chữ và kết thúc bằng sự kiện `done` chứa câu trả lời hoàn chỉnh kèm nguồn tham chiếu.',
  })
  @ApiResponse({ status: 200, description: 'Luồng sự kiện text/event-stream' })
  async askStream(
    @CurrentUser('id') userId: string,
    @Body() dto: AskAssistantDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });
    req.on('aborted', () => abortController.abort());

    await this.assistantService.askStream(
      userId,
      dto,
      (suKien) => {
        if (res.writableEnded || abortController.signal.aborted) return;
        res.write(`event: ${suKien.event}\ndata: ${JSON.stringify(suKien.data)}\n\n`);
      },
      abortController.signal,
    );

    if (!res.writableEnded) {
      res.end();
    }
  }
  @Get('conversations')
  @ApiOperation({ summary: 'Danh sách cuộc hội thoại với trợ lý của tôi (trong 30 ngày gần nhất)' })
  @ApiResponse({ status: 200, description: 'Danh sách hội thoại sắp xếp mới nhất trước' })
  listConversations(@CurrentUser('id') userId: string) {
    return this.assistantService.listConversations(userId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Chi tiết một cuộc hội thoại kèm lịch sử tin nhắn' })
  @ApiResponse({ status: 200, description: 'Chi tiết hội thoại và các lượt hỏi–đáp' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hoặc hội thoại đã quá hạn lưu trữ' })
  getConversation(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistantService.getConversation(userId, id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Xoá một cuộc hội thoại khỏi lịch sử' })
  @ApiResponse({ status: 200, description: 'Đã xoá cuộc hội thoại' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cuộc hội thoại' })
  deleteConversation(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistantService.deleteConversation(userId, id);
  }
}
