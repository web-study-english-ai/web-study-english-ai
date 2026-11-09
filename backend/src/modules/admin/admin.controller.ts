import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { AdminService } from './admin.service';
import {
  AdminListReadingDto,
  AdminListUsersDto,
  AdminListWordsDto,
  AdminUpdateReadingDto,
  AdminUpdateUserDto,
  AdminUpdateWordDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private assertAdmin(user: AuthUser) {
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền truy cập');
    }
  }

  // ==================== 1. QUẢN LÝ TỪ VỰNG ====================
  @Get('words')
  @ApiOperation({ summary: 'Danh sách từ vựng dành cho Admin' })
  listWords(@CurrentUser() user: AuthUser, @Query() query: AdminListWordsDto) {
    this.assertAdmin(user);
    return this.adminService.listWords(query);
  }

  @Patch('words/:id')
  @ApiOperation({ summary: 'Cập nhật từ vựng (Admin)' })
  updateWord(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateWordDto,
  ) {
    this.assertAdmin(user);
    return this.adminService.updateWord(id, dto);
  }

  @Delete('words/:id')
  @ApiOperation({ summary: 'Xóa từ vựng (Admin)' })
  deleteWord(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.adminService.deleteWord(id);
  }

  // ==================== 2. QUẢN LÝ TÀI KHOẢN ====================
  @Get('users')
  @ApiOperation({ summary: 'Danh sách tài khoản người dùng (Admin)' })
  listUsers(@CurrentUser() user: AuthUser, @Query() query: AdminListUsersDto) {
    this.assertAdmin(user);
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Cập nhật vai trò hoặc khóa/mở khóa tài khoản (Admin)' })
  updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    this.assertAdmin(user);
    return this.adminService.updateUser(user.id, id, dto);
  }

  // ==================== 3. QUẢN LÝ BÀI ĐỌC HIỂU ====================
  @Get('reading/topics')
  @ApiOperation({ summary: 'Danh sách chủ đề bài đọc hiểu (Admin)' })
  listReadingTopics(@CurrentUser() user: AuthUser) {
    this.assertAdmin(user);
    return this.adminService.listReadingTopics();
  }

  @Get('reading')
  @ApiOperation({ summary: 'Danh sách bài đọc hiểu (Admin)' })
  listReading(@CurrentUser() user: AuthUser, @Query() query: AdminListReadingDto) {
    this.assertAdmin(user);
    return this.adminService.listReading(query);
  }

  @Patch('reading/:id')
  @ApiOperation({ summary: 'Cập nhật bài đọc hiểu (Admin)' })
  updateReading(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateReadingDto,
  ) {
    this.assertAdmin(user);
    return this.adminService.updateReading(id, dto);
  }

  @Delete('reading/:id')
  @ApiOperation({ summary: 'Xóa bài đọc hiểu (Admin)' })
  deleteReading(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.assertAdmin(user);
    return this.adminService.deleteReading(id);
  }
}