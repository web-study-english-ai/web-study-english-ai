"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/hooks/useAuth";

const passwordSchema = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .regex(/[a-z]/, "Mật khẩu cần ít nhất 1 chữ thường")
  .regex(/[A-Z]/, "Mật khẩu cần ít nhất 1 chữ hoa")
  .regex(/[0-9]/, "Mật khẩu cần ít nhất 1 chữ số");

const registerSchema = z
  .object({
    name: z.string().min(1, "Vui lòng nhập họ tên"),
    email: z.string().min(1, "Vui lòng nhập email").email("Email không đúng định dạng"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
    agree: z.literal(true, {
      error: "Bạn cần đồng ý điều khoản để tiếp tục",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

function getPasswordStrength(password: string) {
  if (!password) return { label: "", score: 0, color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Yếu", score, color: "bg-destructive" };
  if (score <= 3) return { label: "Trung bình", score, color: "bg-yellow-500" };
  if (score <= 4) return { label: "Mạnh", score, color: "bg-green-500" };
  return { label: "Rất mạnh", score, color: "bg-green-600" };
}

export function RegisterForm() {
  const { register: registerUser, isLoading, error } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const passwordValue = useWatch({ control, name: "password" }) || "";
  const strength = getPasswordStrength(passwordValue);

    const onSubmit = (values: RegisterValues) =>
    registerUser({
      name: values.name,
      email: values.email,
      password: values.password,
      confirmPassword: values.confirmPassword,
    });
    function dangNhapGoogle() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
    window.location.href = `${apiUrl}/auth/google`;
  }
  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-6 flex items-center gap-2 lg:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700">
          <GraduationCap className="h-5 w-5 text-white" />
        </span>
        <span className="font-heading text-base font-semibold text-foreground">Study English</span>
      </div>

      <h1 className="mb-1.5 font-heading text-2xl font-bold text-foreground">Tạo tài khoản</h1>
      <p className="mb-7 text-sm text-muted-foreground">
        Bắt đầu lộ trình học 10 phút mỗi ngày, được cá nhân hóa riêng cho bạn.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Họ và tên</Label>
          <Input
            id="name"
            type="text"
            placeholder="Nguyễn Văn A"
            className="rounded-xl border-none bg-muted/70 py-5"
            {...register("name")}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="ban@gmail.com"
            className="rounded-xl border-none bg-muted/70 py-5"
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Ít nhất 8 ký tự"
              className="rounded-xl border-none bg-muted/70 py-5 pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {passwordValue && (
            <div className="space-y-1 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-muted"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{strength.label}</p>
            </div>
          )}
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="Nhập lại mật khẩu"
              className="rounded-xl border-none bg-muted/70 py-5 pr-10"
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="flex items-start gap-2 pt-1 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-0.5 h-4 w-4" {...register("agree")} />
            <span>
              Tôi đồng ý với{" "}
              <a href="#" className="font-semibold text-rose-500">Điều khoản dịch vụ</a> và{" "}
              <a href="#" className="font-semibold text-rose-500">Chính sách bảo mật</a>
            </span>
          </label>
          {errors.agree && <p className="text-xs text-destructive">{errors.agree.message}</p>}
        </div>

        <Button
          type="submit"
          className="w-full rounded-full bg-rose-500 py-5 text-white hover:bg-rose-600"
          disabled={isLoading}
        >
          {isLoading ? "Đang tạo tài khoản..." : "Đăng ký"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Hoặc tiếp tục với
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" type="button" className="rounded-full py-5 " onClick={dangNhapGoogle}>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 5.6 29.5 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 7.1 29.5 5 24 5c-7.3 0-13.6 4.1-16.7 10.1z"/>
            <path fill="#4CAF50" d="M24 44.5c5.4 0 10.3-1.9 14-5.6l-6.5-5.4c-2 1.4-4.6 2.2-7.5 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.5 39.6 16.2 44.5 24 44.5z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.5 5.4C41.5 36 44.5 30.6 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
          </svg>
          Google
        </Button>
        <Button variant="outline" type="button" className="rounded-full py-5">
  <svg
    className="mr-2 h-4 w-4"
    viewBox="0 0 24 24"
    fill="#1877F2"
  >
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.099 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.953h-1.514c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.099 24 12.073z" />
  </svg>
  Facebook
</Button>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Đã có tài khoản?{" "}
        <a href="/login" className="font-semibold text-teal-600">
          Đăng nhập tại đây
        </a>
      </p>
    </div>
  );
}