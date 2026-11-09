"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, inputClass } from "@/features/profile/components/ProfileField";
import { ROLE_OPTIONS, roleLabel, uniqueOptions } from "@/features/admin/shared/lib/admin_format";
import { AdminUser, UpdateUserBody } from "../types/users_types";

const schema = z.object({
  fullName: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Họ tên quá dài"),
  role: z.string().min(1),
});

type Values = z.infer<typeof schema>;

interface Props {
  user: AdminUser;
  isSelf: boolean;
  pending: boolean;
  errorText: string | null;
  onSubmit: (body: UpdateUserBody) => void;
  onClose: () => void;
}

export function UserEditDialog({ user, isSelf, pending, errorText, onSubmit, onClose }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user.fullName, role: user.role },
  });

  function submit(values: Values) {
    const body: UpdateUserBody = {};
    if (values.fullName.trim() !== user.fullName) body.fullName = values.fullName.trim();
    // Không đổi vai trò của chính mình
    if (!isSelf && values.role !== user.role) body.role = values.role;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    onSubmit(body);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa tài khoản</DialogTitle>
          <DialogDescription>Chỉ những trường bạn thay đổi mới được gửi lên.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <Field id="user-name" label="Họ tên" error={errors.fullName?.message}>
            <input id="user-name" type="text" className={inputClass} {...register("fullName")} />
          </Field>

          <Field id="user-email" label="Email">
            <input
              id="user-email"
              type="email"
              readOnly
              value={user.email}
              className={inputClass}
            />
          </Field>

          <Field id="user-role" label="Vai trò" error={errors.role?.message}>
            {isSelf ? (
              <>
                <input
                  id="user-role"
                  type="text"
                  readOnly
                  value={roleLabel(user.role)}
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Bạn không thể đổi vai trò của chính mình.
                </p>
              </>
            ) : (
              <select id="user-role" className={inputClass} {...register("role")}>
                {uniqueOptions(ROLE_OPTIONS, user.role).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {errorText && (
            <p role="alert" className="text-sm text-destructive">
              {errorText}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={!isDirty || pending}>
              {pending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}