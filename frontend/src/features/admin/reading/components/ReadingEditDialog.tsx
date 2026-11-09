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
import { textareaClass } from "@/features/admin/shared/components/AdminTableParts";
import { ADMIN_CEFR, uniqueOptions } from "@/features/admin/shared/lib/admin_format";
import { AdminReading, UpdateReadingBody } from "../types/reading_admin_types";

const schema = z.object({
  title: z.string().trim().min(1, "Vui lòng nhập tiêu đề").max(200, "Tiêu đề quá dài"),
  topic: z.string().min(1, "Vui lòng chọn chủ đề"),
  cefr: z.string().min(1, "Vui lòng chọn trình độ"),
  estimatedMinutes: z
    .number({ error: "Vui lòng nhập số" })
    .int("Phải là số nguyên")
    .min(1, "Tối thiểu 1 phút")
    .max(240, "Tối đa 240 phút"),
  content: z.string(),
});

type Values = z.infer<typeof schema>;

interface Props {
  reading: AdminReading;
  topics: string[];
  pending: boolean;
  errorText: string | null;
  onSubmit: (body: UpdateReadingBody) => void;
  onClose: () => void;
}

export function ReadingEditDialog({
  reading,
  topics,
  pending,
  errorText,
  onSubmit,
  onClose,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: reading.title,
      topic: reading.topic,
      cefr: reading.cefr,
      estimatedMinutes: reading.estimatedMinutes,
      content: "",
    },
  });

  function submit(values: Values) {
    const body: UpdateReadingBody = {};
    if (values.title.trim() !== reading.title) body.title = values.title.trim();
    if (values.topic !== reading.topic) body.topic = values.topic;
    if (values.cefr !== reading.cefr) body.cefr = values.cefr;
    if (values.estimatedMinutes !== reading.estimatedMinutes) {
      body.estimatedMinutes = values.estimatedMinutes;
    }
    if (values.content.trim() !== "") body.content = values.content.trim();

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sửa bài đọc {reading.code}</DialogTitle>
          <DialogDescription>Chỉ những trường bạn thay đổi mới được gửi lên.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <Field id="reading-title" label="Tiêu đề" error={errors.title?.message}>
            <input
              id="reading-title"
              type="text"
              className={inputClass}
              {...register("title")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field id="reading-topic" label="Chủ đề" error={errors.topic?.message}>
              <select id="reading-topic" className={inputClass} {...register("topic")}>
                {uniqueOptions(topics, reading.topic).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="reading-cefr" label="Trình độ" error={errors.cefr?.message}>
              <select id="reading-cefr" className={inputClass} {...register("cefr")}>
                {uniqueOptions(ADMIN_CEFR, reading.cefr).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="reading-minutes"
              label="Thời gian đọc (phút)"
              error={errors.estimatedMinutes?.message}
            >
              <input
                id="reading-minutes"
                type="number"
                min={1}
                max={240}
                className={inputClass}
                {...register("estimatedMinutes", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <Field id="reading-content" label="Nội dung bài đọc" error={errors.content?.message}>
            <textarea
              id="reading-content"
              rows={8}
              placeholder="Dán nội dung mới vào đây. Để trống nếu không muốn đổi nội dung."
              className={textareaClass}
              {...register("content")}
            />
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