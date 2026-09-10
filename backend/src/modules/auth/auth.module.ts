import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

/**
 * Chỉ dựng GoogleStrategy khi đã khai đủ ba biến môi trường.
 * Thiếu thì bỏ qua, chỉ mất nút đăng nhập Google chứ không sập cả API.
 */
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const thieu = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'].filter(
      (key) => !config.get<string>(key),
    );

    if (thieu.length > 0) {
      new Logger('AuthModule').warn(
        `Chưa cấu hình đăng nhập Google, thiếu: ${thieu.join(', ')}. Bỏ qua GoogleStrategy.`,
      );
      return null;
    }

    return new GoogleStrategy(config);
  },
};

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: Number(config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN')),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, googleStrategyProvider],
})
export class AuthModule {}

