import { Body, Controller, Get, Patch, HttpCode, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import type { TepAnhTaiLen } from '../vision/vision.types';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy hồ sơ của chính mình' })
  @ApiResponse({ status: 200, description: 'Trả về hồ sơ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật hồ sơ của chính mình' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên ảnh đại diện của chính mình' })
  @ApiResponse({ status: 200, description: 'Trả về đường dẫn ảnh đại diện mới' })
  @ApiResponse({ status: 400, description: 'Tệp ảnh không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  uploadAvatar(@CurrentUser('id') userId: string, @UploadedFile() file?: TepAnhTaiLen) {
    return this.usersService.uploadAvatar(userId, file);
  }
}
