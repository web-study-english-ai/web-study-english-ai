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
import {
  ADMIN_CEFR,
  POS_OPTIONS,
  posLong,
  uniqueOptions,
} from "@/features/admin/shared/lib/admin_format";
import { AdminWord, UpdateWordBody, WordTopic } from "../types/words_types";

const schema = z.object({
  term: z.string().trim().min(1, "Vui lòng nhập từ vựng").max(100, "Từ vựng quá dài"),
  pos: z.string().min(1, "Vui lòng chọn từ loại"),
  cefr: z.string().min(1, "Vui lòng chọn trình độ"),
  ipa: z.string().trim().max(100, "Phiên âm quá dài"),
  meaningVi: z.string().trim().min(1, "Vui lòng nhập nghĩa").max(500, "Nghĩa quá dài"),
  exampleEn: z.string().trim().max(1000, "Ví dụ quá dài"),
  topicId: z.string(), // "" = không có chủ đề
});

type Values = z.infer<typeof schema>;

// Chỉ gửi những trường người dùng đã đổi
function buildBody(values: Values, word: AdminWord): UpdateWordBody {
  const body: UpdateWordBody = {};
  if (values.term.trim() !== word.term) body.term = values.term.trim();
  if (values.pos !== word.pos) body.pos = values.pos;
  if (values.cefr !== word.cefr) body.cefr = values.cefr;
  if (values.ipa.trim() !== word.ipa) body.ipa = values.ipa.trim();
  if (values.meaningVi.trim() !== word.meaningVi) body.meaningVi = values.meaningVi.trim();
  if (values.exampleEn.trim() !== word.exampleEn) body.exampleEn = values.exampleEn.trim();
  const currentTopic = word.topic?.id ?? "";
  if (values.topicId !== currentTopic) body.topicId = values.topicId === "" ? null : values.topicId;
  return body;
}

interface Props {
  word: AdminWord;
  topics: WordTopic[];
  pending: boolean;
  errorText: string | null;
  onSubmit: (body: UpdateWordBody) => void;
  onClose: () => void;
}

export function WordEditDialog({ word, topics, pending, errorText, onSubmit, onClose }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      term: word.term,
      pos: word.pos,
      cefr: word.cefr,
      ipa: word.ipa,
      meaningVi: word.meaningVi,
      exampleEn: word.exampleEn,
      topicId: word.topic?.id ?? "",
    },
  });

  const currentTopic = word.topic;
  const topicOptions =
    currentTopic && !topics.some((t) => t.id === currentTopic.id)
      ? [...topics, currentTopic]
      : topics;

  function submit(values: Values) {
    const body = buildBody(values, word);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sửa từ vựng</DialogTitle>
          <DialogDescription>Chỉ những trường bạn thay đổi mới được gửi lên.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <Field id="word-term" label="Từ vựng" error={errors.term?.message}>
            <input id="word-term" type="text" className={inputClass} {...register("term")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="word-pos" label="Từ loại" error={errors.pos?.message}>
              <select id="word-pos" className={inputClass} {...register("pos")}>
                {uniqueOptions(POS_OPTIONS, word.pos).map((p) => (
                  <option key={p} value={p}>
                    {posLong(p)}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="word-cefr" label="Trình độ" error={errors.cefr?.message}>
              <select id="word-cefr" className={inputClass} {...register("cefr")}>
                {uniqueOptions(ADMIN_CEFR, word.cefr).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field id="word-ipa" label="Phiên âm" error={errors.ipa?.message}>
            <input id="word-ipa" type="text" className={inputClass} {...register("ipa")} />
          </Field>

          <Field id="word-meaning" label="Nghĩa tiếng Việt" error={errors.meaningVi?.message}>
            <input id="word-meaning" type="text" className={inputClass} {...register("meaningVi")} />
          </Field>

          <Field id="word-example" label="Câu ví dụ" error={errors.exampleEn?.message}>
            <textarea
              id="word-example"
              rows={3}
              className={textareaClass}
              {...register("exampleEn")}
            />
          </Field>

          <Field id="word-topic" label="Chủ đề" error={errors.topicId?.message}>
            <select id="word-topic" className={inputClass} {...register("topicId")}>
              <option value="">Không có chủ đề</option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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