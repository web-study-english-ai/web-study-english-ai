import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { VisionService } from './vision.service';
import type { TepAnhTaiLen } from './vision.types';

@ApiTags('vision')
@Controller()
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  @Post(['vision/detect', 'recognize/image'])
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Nhận diện từ vựng tiếng Anh từ ảnh tải lên hoặc chụp trực tiếp (WSEA-155)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Tệp ảnh JPEG, PNG hoặc WebP (tối đa 5 MB)',
        },
      },
    },
  })
  detectImage(@CurrentUser('id') userId: string, @UploadedFile() file?: TepAnhTaiLen) {
    return this.visionService.detectFromImage(userId, file);
  }

  @Get('vision/images/:fileName')
  @ApiOperation({ summary: 'Truy xuất ảnh minh hoạ đã lưu theo mã băm SHA-256 (WSEA-156)' })
  async getStoredImage(@Param('fileName') fileName: string, @Res() res: Response) {
    const anh = await this.visionService.layTepAnhDaLuu(fileName);
    if (!anh) {
      throw new NotFoundException('Không tìm thấy tệp ảnh');
    }
    res.setHeader('Content-Type', anh.mimetype);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(anh.buffer);
  }
}
