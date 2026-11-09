import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "../hooks/useNotice";

export function AdminNotice({
  notice,
  onClose,
}: {
  notice: Notice | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  const ok = notice.type === "success";
  const Icon = ok ? CheckCircle2 : XCircle;

  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        ok
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">{notice.text}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thông báo"
        className="opacity-60 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}