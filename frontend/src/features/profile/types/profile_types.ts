export type ProfileLanguage = "vi" | "en";

export interface ProfileData {
  name: string;
  email: string;
  avatarUrl: string | null;
  language: ProfileLanguage;
}

export interface UpdateProfilePayload {
  name: string;
  language: ProfileLanguage;
  newPassword?: string; // không gửi nếu không đổi mật khẩu
}