import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { VisionService } from './vision.service';
import type { TepAnhTaiLen } from './vision.types';

@ApiTags('vision')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  @Post(['vision/detect', 'recognize/image'])
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
}
