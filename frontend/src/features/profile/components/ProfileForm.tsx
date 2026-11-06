"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { useUpdateProfile } from "../hooks/useUpdateProfile";
import { ProfileData } from "../types/profile_types";
import { LANGUAGE_OPTIONS } from "../utils/profile_options";
import { Field, inputClass } from "./ProfileField";
import { SettingsCard } from "./SettingsCard";
import { ThemeSwitch } from "./ThemeSwitch";

const passwordRules = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .regex(/[a-z]/, "Mật khẩu cần ít nhất 1 chữ thường")
  .regex(/[A-Z]/, "Mật khẩu cần ít nhất 1 chữ hoa")
  .regex(/[0-9]/, "Mật khẩu cần ít nhất 1 chữ số");

const profileSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Họ tên quá dài"),
  // Để trống = không đổi mật khẩu
  newPassword: z.string().superRefine((value, ctx) => {
    if (value === "") return;
    const result = passwordRules.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: result.error.issues[0].message });
    }
  }),
  language: z.enum(["vi", "en"]),
  darkMode: z.boolean(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function toFormValues(profile: ProfileData): ProfileFormValues {
  return {
    name: profile.name,
    newPassword: "",
    language: profile.language,
    darkMode: getStoredTheme() === "dark",
  };
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [showPassword, setShowPassword] = useState(false);
  const { mutate, isPending, isError, isSuccess, reset: resetMutation } = useUpdateProfile();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: toFormValues(profile),
  });

  function onSubmit(values: ProfileFormValues) {
    const name = values.name.trim();

    mutate(
      {
        name,
        language: values.language,
        newPassword: values.newPassword || undefined,
      },
      {
        onSuccess: () => {
          applyTheme(values.darkMode ? "dark" : "light");
          reset({ ...values, name, newPassword: "" });
          setShowPassword(false);
        },
      }
    );
  }

  function handleCancel() {
    reset(toFormValues(profile));
    resetMutation();
    setShowPassword(false);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard title="Thông tin cơ bản">
          <Field id="name" label="Họ tên" error={errors.name?.message}>
            <input id="name" type="text" className={inputClass} {...register("name")} />
          </Field>

          <Field id="email" label="Email">
            <input
              id="email"
              type="email"
              readOnly
              value={profile.email}
              className={inputClass}
            />
          </Field>

          <Field id="newPassword" label="Mật khẩu mới" error={errors.newPassword?.message}>
            <div className="relative">
              <input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Để trống nếu không đổi"
                className={`${inputClass} pr-10`}
                {...register("newPassword")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </SettingsCard>

        <SettingsCard title="Giao diện & ngôn ngữ">
          <Field id="language" label="Ngôn ngữ hiển thị" error={errors.language?.message}>
            <select id="language" className={inputClass} {...register("language")}>
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="dark-mode" label="Chế độ giao diện">
            <Controller
              control={control}
              name="darkMode"
              render={({ field }) => (
                <ThemeSwitch id="dark-mode" checked={field.value} onChange={field.onChange} />
              )}
            />
          </Field>
        </SettingsCard>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {isError && (
          <p role="alert" className="mr-auto text-sm text-destructive">
            Không lưu được thay đổi, vui lòng thử lại.
          </p>
        )}
        {isSuccess && !isDirty && (
          <p role="status" className="mr-auto text-sm text-green-600">
            Đã lưu thay đổi.
          </p>
        )}

        <Button type="button" variant="outline" disabled={!isDirty || isPending} onClick={handleCancel}>
          Hủy
        </Button>
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}