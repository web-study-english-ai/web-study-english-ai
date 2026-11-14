"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { useUpdateProfile } from "../hooks/useUpdateProfile";
import { ProfileData } from "../types/profile_types";
import { Field, inputClass } from "./ProfileField";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import { SettingsCard } from "./SettingsCard";
import { ThemeSwitch } from "./ThemeSwitch";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

const passwordRules = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .regex(/[a-z]/, "Mật khẩu cần ít nhất 1 chữ thường")
  .regex(/[A-Z]/, "Mật khẩu cần ít nhất 1 chữ hoa")
  .regex(/[0-9]/, "Mật khẩu cần ít nhất 1 chữ số");

const profileSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Họ tên quá dài"),
  // Để trống = không cập nhật
  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^(\+84|0)\d{9}$/.test(v.replace(/\s/g, "")),
      "Số điện thoại không hợp lệ"
    ),
  address: z.string().trim().max(255, "Địa chỉ quá dài"),
  birthDate: z
    .string()
    .refine((v) => v === "" || new Date(v) <= new Date(), "Ngày sinh không hợp lệ"),
  currentPassword: z.string(),
  // Để trống = không đổi mật khẩu
  newPassword: z.string().superRefine((value, ctx) => {
    if (value === "") return;
    const result = passwordRules.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: result.error.issues[0].message });
    }
  }),
  darkMode: z.boolean(),
  avatarFile: z.custom<File | null>((v) => v === null || v instanceof File),
}).superRefine((values, ctx) => {
  // Đã nhập mật khẩu hiện tại nhưng chưa nhập mật khẩu mới
  if (values.currentPassword !== "" && values.newPassword === "") {
    ctx.addIssue({
      code: "custom",
      path: ["newPassword"],
      message: "Vui lòng nhập mật khẩu mới",
    });
    return;
  }

  if (values.newPassword === "") return;

  if (values.currentPassword === "") {
    ctx.addIssue({
      code: "custom",
      path: ["currentPassword"],
      message: "Vui lòng nhập mật khẩu hiện tại",
    });
  } else if (values.currentPassword === values.newPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["newPassword"],
      message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    });
  }
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function toFormValues(profile: ProfileData): ProfileFormValues {
  return {
    name: profile.name,
    phone: profile.phone,
    address: profile.address,
    birthDate: profile.birthDate,
    currentPassword: "",
    newPassword: "",
    darkMode: getStoredTheme() === "dark",
    avatarFile: null,
  };
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [showPassword, setShowPassword] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const { mutate, isPending, isError, error, isSuccess, reset: resetMutation } = useUpdateProfile();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: toFormValues(profile),
  });

  // Ảnh xem trước cho file vừa chọn, thu hồi URL khi đổi file hoặc rời trang
  const avatarFile = watch("avatarFile");
  const hasCurrentPassword = watch("currentPassword") !== "";
  useEffect(() => {
    if (!avatarFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function handlePickAvatar(file: File) {
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Ảnh không được vượt quá 2MB.");
      return;
    }
    setAvatarError("");
    setValue("avatarFile", file, { shouldDirty: true });
  }

  function onSubmit(values: ProfileFormValues) {
    const name = values.name.trim();
    const phone = values.phone.replace(/\s/g, "");
    const address = values.address.trim();

    mutate(
      {
        name,
        phone,
        address,
        birthDate: values.birthDate,
        currentPassword: values.newPassword ? values.currentPassword : undefined,
        newPassword: values.newPassword || undefined,
        avatarFile: values.avatarFile,
      },
      {
        onSuccess: () => {
          applyTheme(values.darkMode ? "dark" : "light");
          reset({
            ...values,
            name,
            phone,
            address,
            currentPassword: "",
            newPassword: "",
            avatarFile: null,
          });
          setShowPassword(false);
        },
      }
    );
  }

  function handleCancel() {
    reset(toFormValues(profile));
    resetMutation();
    setShowPassword(false);
    setAvatarError("");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <ProfileHeaderCard
        name={profile.name}
        email={profile.email}
        avatarUrl={preview ?? profile.avatarUrl}
        avatarError={avatarError}
        onPickAvatar={handlePickAvatar}
      >
        <Controller
          control={control}
          name="darkMode"
          render={({ field }) => (
            <ThemeSwitch id="dark-mode" checked={field.value} onChange={field.onChange} />
          )}
        />
      </ProfileHeaderCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard title="Thông tin cơ bản">
          <Field id="name" label="Họ tên" error={errors.name?.message}>
            <input id="name" type="text" className={inputClass} {...register("name")} />
          </Field>

          <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Ví dụ: 0912345678"
              className={inputClass}
              {...register("phone")}
            />
          </Field>

          <Field id="address" label="Địa chỉ" error={errors.address?.message}>
            <input
              id="address"
              type="text"
              autoComplete="street-address"
              className={inputClass}
              {...register("address")}
            />
          </Field>

          <Field id="birthDate" label="Ngày sinh" error={errors.birthDate?.message}>
            <input id="birthDate" type="date" className={inputClass} {...register("birthDate")} />
          </Field>
        </SettingsCard>

        <SettingsCard title="Đổi mật khẩu">
          <Field
            id="currentPassword"
            label="Mật khẩu hiện tại"
            error={errors.currentPassword?.message}
          >
            <div className="relative">
              <input
                id="currentPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Nhập để mở khóa đổi mật khẩu"
                className={`${inputClass} pr-10`}
                {...register("currentPassword", {
                  // Xóa mật khẩu hiện tại thì xóa luôn mật khẩu mới đã nhập
                  onChange: (e) => {
                    if (!e.target.value) setValue("newPassword", "", { shouldValidate: true });
                  },
                })}
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

          <Field id="newPassword" label="Mật khẩu mới" error={errors.newPassword?.message}>
            <input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              disabled={!hasCurrentPassword}
              placeholder={
                hasCurrentPassword ? "Để trống nếu không đổi" : "Nhập mật khẩu hiện tại trước"
              }
              className={inputClass}
              {...register("newPassword")}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
          </p>
        </SettingsCard>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {isError && (
          <p role="alert" className="mr-auto text-sm text-destructive">
            {error instanceof Error && error.message
              ? error.message
              : "Không lưu được thay đổi, vui lòng thử lại."}
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