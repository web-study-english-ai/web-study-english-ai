export interface ProfileData {
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string;
  address: string;
  birthDate: string; // dạng YYYY-MM-DD, chuỗi rỗng nếu chưa có
}

export interface UpdateProfilePayload {
  name: string;
  phone: string;
  address: string;
  birthDate: string;
  currentPassword?: string; // bắt buộc khi đổi mật khẩu
  newPassword?: string; // không gửi nếu không đổi mật khẩu
  avatarFile?: File | null; // chỉ có khi người dùng chọn ảnh mới
}

export interface UpdateProfileResult {
  avatarUrl: string | null; // URL ảnh mới nếu vừa upload
}