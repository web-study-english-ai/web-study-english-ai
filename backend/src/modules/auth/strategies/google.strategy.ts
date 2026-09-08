import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

export interface OAuthProfile {
  provider: 'GOOGLE';
  providerId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }
  authorizationParams(): Record<string, string> {
    return { prompt: 'select_account' };
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0];
    if (!email) {
      return done(new Error('Tài khoản Google này không có email'), undefined);
    }

    const ketQua: OAuthProfile = {
      provider: 'GOOGLE',
      providerId: profile.id,
      email: email.value.toLowerCase(),
      emailVerified: String(email.verified) === 'true',
      fullName: profile.displayName || email.value.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, ketQua);
  }
}
