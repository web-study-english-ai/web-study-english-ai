"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Plus,
  Send,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { AdminTabs } from "@/features/admin/shared/components/AdminTabs";
import { Button } from "@/components/ui/button";
import { createAdminReadingApi } from "../api/reading_admin_api";
import { ADMIN_CEFR } from "@/features/admin/shared/lib/admin_format";
import { cn } from "@/lib/utils";

interface QuestionFormItem {
  id: string;
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string;
}

export default function AdminCreateReadingPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [cefr, setCefr] = useState("B1");
  const [estimatedMinutes, setEstimatedMinutes] = useState(5);
  const [content, setContent] = useState("");
  const [questions, setQuestions] = useState<QuestionFormItem[]>([
    {
      id: "q_1",
      questionText: "",
      options: ["", "", "", ""],
      correctOptionIndex: 0,
      explanation: "",
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Đếm số từ trong bài đọc
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}`,
        questionText: "",
        options: ["", "", "", ""],
        correctOptionIndex: 0,
        explanation: "",
      },
    ]);
  }

  function removeQuestion(index: number) {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuestion<K extends keyof QuestionFormItem>(
  index: number,
  field: K,
  val: QuestionFormItem[K]
) {
  setQuestions((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: val };
    return next;
  });
}

  function updateOption(qIndex: number, optIndex: number, text: string) {
    setQuestions((prev) => {
      const next = [...prev];
      const opts = [...next[qIndex].options] as [string, string, string, string];
      opts[optIndex] = text;
      next[qIndex] = { ...next[qIndex], options: opts };
      return next;
    });
  }

  // Checklist kiểm tra trước khi đăng bài
  const hasInfo = Boolean(title.trim() && topic.trim());
  const hasContent = Boolean(content.trim().length >= 10);
  const allQuestionsHaveText = questions.every((q) => q.questionText.trim().length > 0);
  const allOptionsFilled = questions.every((q) =>
    q.options.every((opt) => opt.trim().length > 0)
  );
  const isReady = hasInfo && hasContent && allQuestionsHaveText && allOptionsFilled;
async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) {
      setErrorMsg("Vui lòng điền đầy đủ các mục trong danh sách kiểm tra trước khi đăng bài.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await createAdminReadingApi({
        title: title.trim(),
        content: content.trim(),
        topic: topic.trim(),
        cefr,
        estimatedMinutes: Number(estimatedMinutes) || 5,
        questions: questions.map((q) => ({
          questionText: q.questionText.trim(),
          options: q.options.map((opt) => opt.trim()),
          correctOptionIndex: q.correctOptionIndex,
          explanation: q.explanation.trim() || undefined,
        })),
      });

      router.push("/admin/reading");
      } catch (err: unknown) {
  setErrorMsg(
    err instanceof Error && err.message
      ? err.message
      : "Không thể tạo bài đọc. Vui lòng thử lại."
  );
} finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer>
      <div className="space-y-5 pb-16">
        <AdminTabs />

        <div className="flex items-center gap-2">
          <Link
            href="/admin/reading"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại danh sách bài đọc
          </Link>
        </div>

        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Thêm bài đọc</h1>
          <p className="text-sm text-muted-foreground">
            Biên soạn nội dung và câu hỏi đọc hiểu. Kiểm tra thông tin trước khi đăng bài.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* CỘT TRÁI: Nhập bài đọc & Câu hỏi */}
          <div className="space-y-6">
            {/* 1. Thông tin bài đọc */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-foreground">Thông tin bài đọc</h2>
                <span className="text-xs text-destructive">* Trường bắt buộc</span>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground">Tiêu đề bài đọc *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Small Habits, Lasting Progress"
                    value={title}
onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">Chủ đề *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Giáo dục, Du lịch"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Trình độ *</label>
                    <select
                      value={cefr}
                      onChange={(e) => setCefr(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {ADMIN_CEFR.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-foreground">Thời gian đọc (phút) *</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                      className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Nội dung bài đọc */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-foreground">Nội dung bài đọc *</h2>
                <span className="text-xs text-muted-foreground">{wordCount} từ tiếng Anh</span>
              </div>

              <div className="mt-4">
                <textarea
                  rows={8}
                  required
                  placeholder="Nhập nội dung bài đọc tiếng Anh tại đây..."
value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3.5 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* 3. Câu hỏi đọc hiểu */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">Câu hỏi đọc hiểu</h2>
                <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {questions.length} câu hỏi
                </span>
              </div>

              {questions.map((q, qIndex) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-sm font-bold text-foreground">Câu hỏi {qIndex + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Trắc nghiệm • 1 đáp án đúng</span>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIndex)}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                          title="Xóa câu hỏi"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="text-xs font-medium text-foreground">Nội dung câu hỏi *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: What does Emma do every morning?"
                        value={q.questionText}
                        onChange={(e) => updateQuestion(qIndex, "questionText", e.target.value)}
                        className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>

                    {/* 4 phương án lựa chọn A, B, C, D */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(["A", "B", "C", "D"] as const).map((label, optIndex) => {
                        const isCorrect = q.correctOptionIndex === optIndex;
                        return (
                          <div
key={label}
                            onClick={() => updateQuestion(qIndex, "correctOptionIndex", optIndex)}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors",
                              isCorrect
                                ? "border-emerald-500 bg-emerald-500/5 text-emerald-900"
                                : "border-border bg-background hover:bg-muted/40"
                            )}
                          >
                            <input
                              type="radio"
                              name={`correct_${q.id}`}
                              checked={isCorrect}
                              onChange={() => updateQuestion(qIndex, "correctOptionIndex", optIndex)}
                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-bold text-muted-foreground">{label}.</span>
                            <input
                              type="text"
                              required
                              placeholder={`Phương án ${label}`}
                              value={q.options[optIndex]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                              className="h-8 flex-1 rounded-lg border-none bg-transparent px-1 text-sm outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Giải thích đáp án đúng (tùy chọn)</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Đoạn 2 nêu rõ Emma đọc một bài viết ngắn..."
                        value={q.explanation}
                        onChange={(e) => updateQuestion(qIndex, "explanation", e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addQuestion}
                className="w-full rounded-2xl border-dashed py-5 text-sm font-semibold"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Thêm câu hỏi
              </Button>
            </div>
          </div>

          {/* CỘT PHẢI: Checklist & Hành động */}
          <div className="space-y-6">
{/* Khối Xuất bản */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">Xuất bản</h2>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Trạng thái</span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                  Đã xuất bản
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Bài đọc sẽ hiển thị ngay cho học viên trong danh sách bài đọc hiểu sau khi bấm Đăng bài.
              </p>
            </div>

            {/* Khối Checklist kiểm tra trước khi đăng */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">Kiểm tra trước khi đăng</h2>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  {hasInfo ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={hasInfo ? "text-foreground" : "text-muted-foreground"}>
                    Đã có thông tin bài đọc
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {hasContent ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={hasContent ? "text-foreground" : "text-muted-foreground"}>
                    Đã có nội dung tiếng Anh
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {allQuestionsHaveText && allOptionsFilled ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={
                      allQuestionsHaveText && allOptionsFilled
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {questions.length}/{questions.length} câu hỏi đủ 4 lựa chọn
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-foreground">
{questions.length}/{questions.length} câu hỏi có đáp án đúng
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xs font-semibold text-emerald-600">
                  {isReady ? "✓ Bài đọc đã sẵn sàng để đăng." : "Chưa hoàn tất các trường bắt buộc."}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <Button
                  type="submit"
                  disabled={submitting || !isReady}
                  className="w-full rounded-xl py-5 text-sm font-bold"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? "Đang lưu bài đọc..." : "Đăng bài"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/admin/reading")}
                  className="w-full rounded-xl py-5 text-sm"
                >
                  Hủy
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}