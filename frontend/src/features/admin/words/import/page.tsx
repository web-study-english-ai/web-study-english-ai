"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, FileSpreadsheet, RefreshCw, Upload, AlertCircle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { AdminTabs } from "@/features/admin/shared/components/AdminTabs";
import { Button } from "@/components/ui/button";
import { previewWordsFileApi, importWordsApi, PreviewRow } from "@/features/admin/words/api/words_api";
import { cn } from "@/lib/utils";

function getCefrBadgeClass(level: string) {
  switch (level?.toUpperCase()) {
    case "A1":
      return "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20";
    case "A2":
      return "bg-sky-500/10 text-sky-600 border border-sky-500/20";
    case "B1":
      return "bg-amber-500/10 text-amber-600 border border-amber-500/20";
    case "B2":
      return "bg-rose-500/10 text-rose-600 border border-rose-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function AdminImportWordsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<{
    total: number;
    validCount: number;
    errorCount: number;
    rows: PreviewRow[];
  } | null>(null);

  const [skipErrors, setSkipErrors] = useState(true);

  // Tải file mẫu CSV
  function downloadTemplate() {
    const csvContent =
      "term,pos,meaning_vi,topic,cefr,ipa,example_en\n" +
      "persist,v,Kiên trì; bền bỉ,Nghị lực & Bền bỉ,B2,/pəˈsɪst/,She persisted in her studies.\n" +
      "eloquent,adj,Hùng biện; lưu loát,Giao tiếp thuyết phục,B1,/ˈel.ə.kwənt/,An eloquent speech.\n" +
      "synthesize,v,Tổng hợp,Học thuật,B2,/ˈsɪn.θə.saɪz/,Synthesize the research results.\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tu_vung_mau.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Xử lý chọn file
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingPreview(true);

    try {
      const res = await previewWordsFileApi(file);
      setPreviewData(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Không đọc được file CSV. Vui lòng kiểm tra lại định dạng.";
      setErrorMsg(message);
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  // Nạp dữ liệu vào DB
  async function handleImport() {
    if (!previewData) return;

    const rowsToImport = skipErrors
      ? previewData.rows.filter((r) => r.isValid)
      : previewData.rows;

    if (rowsToImport.length === 0) {
      setErrorMsg("Không có dòng dữ liệu hợp lệ nào để nạp.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = rowsToImport.map((r) => ({
        term: r.term,
        pos: r.pos,
        meaningVi: r.meaningVi,
        topic: r.topic,
        cefr: r.cefr,
        ipa: r.ipa,
        exampleEn: r.exampleEn,
      }));

      const res = await importWordsApi(payload);
      setSuccessMsg(res.message);
      setTimeout(() => {
        router.push("/admin/words");
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Có lỗi xảy ra khi nạp từ vựng.";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  const validRowsToSubmit = previewData
    ? skipErrors
      ? previewData.validCount
      : previewData.total
    : 0;

  return (
    <PageContainer>
      <div className="space-y-5 pb-12">
        <AdminTabs />

        <div className="flex items-center gap-2">
          <Link
            href="/admin/words"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại danh sách từ vựng
          </Link>
        </div>

        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">Nạp dữ liệu từ vựng</h1>
          <p className="text-sm text-muted-foreground">
            Tải tệp lên, kiểm tra dữ liệu và xác nhận các từ vựng muốn thêm vào hệ thống.
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-600">
            <Check className="h-4 w-4 shrink-0" />
            <span>{successMsg} Đang chuyển hướng...</span>
          </div>
        )}

        {/* Khối tải file và Hướng dẫn */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          {/* Cột trái: Tệp dữ liệu */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Tệp dữ liệu</h2>
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Tải tệp mẫu
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  Kéo thả tệp hoặc chọn từ máy tính
                </p>
                <p className="mt-1 text-xs text-muted-foreground">CSV tối đa 5 MB / 1.000 dòng</p>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3.5">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB{" "}
                      {previewData ? `• ${previewData.total} dòng dữ liệu` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Thay tệp
                </Button>
              </div>
            )}
          </div>

          {/* Cột phải: Hướng dẫn định dạng */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Hướng dẫn định dạng</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Dòng đầu tiên là tên cột. Mỗi dòng tiếp theo tương ứng với một từ vựng.
            </p>

            <div className="mt-4 space-y-2 text-xs">
              <div>
                <span className="font-semibold text-foreground">Từ vựng, từ loại, nghĩa:</span>
                <span className="ml-1 text-destructive">*Bắt buộc</span>
              </div>
              <div>
                <span className="font-semibold text-foreground">Chủ đề, trình độ:</span>
                <span className="ml-1 text-destructive">*Bắt buộc</span>
              </div>
              <div>
                <span className="font-semibold text-foreground">Phiên âm, câu ví dụ:</span>
                <span className="ml-1 text-muted-foreground">Tùy chọn</span>
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
                Trình độ: A1, A2, B1, B2. Từ loại: n, v, adj, adv. File CSV sử dụng bảng mã UTF-8 để giữ dấu tiếng Việt.
              </p>
            </div>
          </div>
        </div>

        {/* Bảng xem trước dữ liệu */}
        {loadingPreview && (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Đang phân tích dữ liệu tệp CSV...
          </div>
        )}

        {!loadingPreview && previewData && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Xem trước dữ liệu</h3>
                <p className="text-xs text-muted-foreground">Hiển thị {previewData.total} dòng trong tệp</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  Tổng: {previewData.total} dòng
                </span>
                <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  {previewData.validCount} hợp lệ
                </span>
                {previewData.errorCount > 0 && (
                  <span className="rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                    {previewData.errorCount} lỗi
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                    <th className="pb-3 pl-2">Dòng</th>
                    <th className="pb-3">Từ vựng</th>
                    <th className="pb-3">Từ loại</th>
                    <th className="pb-3">Nghĩa tiếng Việt</th>
                    <th className="pb-3">Chủ đề</th>
                    <th className="pb-3">Trình độ</th>
                    <th className="pb-3 pr-2 text-right">Kiểm tra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewData.rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={cn(
                        "transition-colors",
                        !r.isValid ? "bg-destructive/5 text-destructive" : "hover:bg-muted/30"
                      )}
                    >
                      <td className="py-3 pl-2 text-xs text-muted-foreground">{r.rowNumber}</td>
                      <td className="py-3 font-semibold text-foreground">{r.term || "—"}</td>
                      <td className="py-3 text-xs lowercase">{r.pos || "—"}</td>
                      <td className="py-3 max-w-[200px] truncate">{r.meaningVi || "—"}</td>
                      <td className="py-3 text-xs">{r.topic || "—"}</td>
                      <td className="py-3">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", getCefrBadgeClass(r.cefr))}>
                          {r.cefr}
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-right">
                        {r.isValid ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                            Hợp lệ
                          </span>
                        ) : (
                          <span
                            title={r.errorMessage}
                            className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
                          >
                            {r.errorMessage || "Lỗi dữ liệu"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewData.errorCount > 0 && (
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                <input
                  id="skip-error-checkbox"
                  type="checkbox"
                  checked={skipErrors}
                  onChange={(e) => setSkipErrors(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                />
                <label htmlFor="skip-error-checkbox" className="text-xs font-medium text-foreground cursor-pointer">
                  Bỏ qua {previewData.errorCount} dòng lỗi và chỉ nạp {previewData.validCount} dòng hợp lệ.
                </label>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/words")}
              >
                Hủy
              </Button>
              <Button
                type="button"
                disabled={submitting || validRowsToSubmit === 0}
                onClick={handleImport}
                className="rounded-xl px-5"
              >
                {submitting ? "Đang nạp từ vựng..." : `Nạp ${validRowsToSubmit} từ vựng`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}