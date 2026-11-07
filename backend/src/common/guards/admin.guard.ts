import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';

@Injectable()
export class AdminGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Xác thực qua header khóa quản trị (x-admin-key)
    // Phục vụ DevOps, automation scripts, cron jobs và inter-service calls
    const adminKey = request.headers['x-admin-key'] as string | undefined;
    const configuredAdminKey = this.configService.get<string>('ADMIN_API_KEY');
    const aiServiceKey = this.configService.get<string>('AI_SERVICE_KEY');

    if (
      (configuredAdminKey && adminKey === configuredAdminKey) ||
      (aiServiceKey && adminKey === aiServiceKey)
    ) {
      return true;
    }

    // 2. Kiểm tra nếu token trong Authorization Bearer trùng với ADMIN_API_KEY / AI_SERVICE_KEY
    const authHeader = request.headers['authorization'] as string | undefined;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (
      bearerToken &&
      ((configuredAdminKey && bearerToken === configuredAdminKey) ||
        (aiServiceKey && bearerToken === aiServiceKey))
    ) {
      return true;
    }

    // 3. Nếu không có Authorization Bearer hợp lệ, từ chối ngay lập tức
    if (!authHeader) {
      throw new UnauthorizedException(
        'Yêu cầu xác thực quyền quản trị (JWT Bearer Token hoặc header x-admin-key)',
      );
    }

    // 4. Xác thực JWT người dùng qua passport-jwt
    let canActivateJwt = false;
    try {
      const res = super.canActivate(context);
      canActivateJwt = isObservable(res) ? await firstValueFrom(res) : await res;
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('Token xác thực không hợp lệ hoặc đã hết hạn');
    }

    if (!canActivateJwt) {
      throw new UnauthorizedException('Token xác thực không hợp lệ hoặc đã hết hạn');
    }

    // 5. Kiểm tra phân quyền: Chỉ tài khoản có vai trò ADMIN mới được phép truy cập
    const user = request.user;
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Truy cập bị từ chối: Chỉ tài khoản Quản trị viên (ADMIN) mới có quyền thực hiện thao tác này',
      );
    }

    return true;
  }
}
