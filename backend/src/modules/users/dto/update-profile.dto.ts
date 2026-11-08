import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, { error: 'Họ và tên không được để trống' })
      .max(100, { error: 'Họ và tên không được quá 100 ký tự' })
      .optional(),

    phone: z
      .string()
      .trim()
      .max(20, { error: 'Số điện thoại không được quá 20 ký tự' })
      .nullable()
      .optional(),

    address: z
      .string()
      .trim()
      .max(255, { error: 'Địa chỉ không được quá 255 ký tự' })
      .nullable()
      .optional(),

    dateOfBirth: z
      .string()
      .trim()
      .nullable()
      .optional(),

    currentPassword: z.string().optional(),

    newPassword: z
      .string()
      .min(8, { error: 'Mật khẩu phải có ít nhất 8 ký tự' })
      .max(72, { error: 'Mật khẩu không được quá 72 ký tự' })
      .optional(),

    avatarUrl: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: 'Phải có ít nhất một trường cần cập nhật',
  });

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}