import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Email không hợp lệ' })),

  password: z.string().min(1, { error: 'Vui lòng nhập mật khẩu' }),
});

export class LoginDto extends createZodDto(loginSchema) {}
