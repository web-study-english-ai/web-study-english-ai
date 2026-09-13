import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { error: 'Họ và tên phải có ít nhất 2 ký tự' })
      .max(100, { error: 'Họ và tên không được quá 100 ký tự' }),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'Email không hợp lệ' })),

    password: z
      .string()
      .min(8, { error: 'Mật khẩu phải có ít nhất 8 ký tự' })
      .max(72, { error: 'Mật khẩu không được quá 72 ký tự' }),

    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export class RegisterDto extends createZodDto(registerSchema) {}
