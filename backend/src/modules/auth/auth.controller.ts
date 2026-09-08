import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { AuthUser } from './strategies/jwt.strategy';
import { AuthGuard } from '@nestjs/passport';
import { HttpException } from '@nestjs/common';
import type { OAuthProfile } from './strategies/google.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Cookie helpers ----------

  private get cookieName(): string {
    return this.config.get<string>('REFRESH_COOKIE_NAME') ?? 'wsea_rt';
  }

  private get cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax') as 'lax' | 'strict' | 'none',
      path: '/api/auth',
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(this.cookieName, token, {
      ...this.cookieOptions,
      expires: expiresAt,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[this.cookieName] as string | undefined;
  }

  private requestMeta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }

  // ---------- Endpoints ----------

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Tạo tài khoản thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Email đã được đăng ký' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Bắt đầu đăng nhập bằng Google' })
  googleAuth() {
    // Guard tự chuyển hướng sang Google, thân hàm không bao giờ chạy
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google gọi lại sau khi người dùng đồng ý' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    try {
      const result = await this.authService.loginWithProvider(
        req.user as OAuthProfile,
        this.requestMeta(req),
      );

      this.setRefreshCookie(res, result.refreshToken.token, result.refreshToken.expiresAt);
      return res.redirect(`${frontendUrl}/auth/callback`);
    } catch (e) {
      const message = e instanceof HttpException ? e.message : 'Đăng nhập bằng Google thất bại';
      return res.redirect(`${frontendUrl}/login?oauth_error=${encodeURIComponent(message)}`);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin người đang đăng nhập' })
  @ApiResponse({ status: 200, description: 'Trả về user hiện tại' })
  @ApiResponse({ status: 401, description: 'Thiếu hoặc sai access token' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập, trả access token và đặt refresh cookie' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  @ApiResponse({ status: 401, description: 'Sai thông tin đăng nhập' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.requestMeta(req));

    this.setRefreshCookie(res, result.refreshToken.token, result.refreshToken.expiresAt);

    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token bằng refresh cookie' })
  @ApiResponse({ status: 200, description: 'Cấp cặp token mới thành công' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refresh(
      this.readRefreshCookie(req),
      this.requestMeta(req),
    );

    this.setRefreshCookie(res, result.refreshToken.token, result.refreshToken.expiresAt);

    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất, thu hồi refresh token' })
  @ApiResponse({ status: 204, description: 'Đăng xuất thành công' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(this.readRefreshCookie(req));
    res.clearCookie(this.cookieName, this.cookieOptions);
  }
}
