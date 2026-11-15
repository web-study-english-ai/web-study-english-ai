"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isForbidden } from "../lib/admin_errors";

export const thClass =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-muted-foreground";
export const tdClass = "px-4 py-3 align-middle";

const actionBase =
  "inline-flex h-7 items-center rounded-md px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const actionEdit = cn(
  actionBase,
  "border border-teal-600 text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-950/40"
);
export const actionDanger = cn(
  actionBase,
  "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
);
export const actionSuccess = cn(
  actionBase,
  "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/70"
);

export const textareaClass =
  "min-h-24 w-full resize-y rounded-xl border-none bg-muted/70 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30";

const TONES = {
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
} as const;

export function Pill({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 text-[11px] font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export type TableStatus = "loading" | "error" | "empty" | "ok";

export function tableStatus(isLoading: boolean, isError: boolean, count: number): TableStatus {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (count === 0) return "empty";
  return "ok";
}

export function TableShell({
  children,
  dimmed,
}: {
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card transition-opacity",
        dimmed && "opacity-60"
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">{children}</table>
      </div>
    </div>
  );
}

export function StateBody({
  status,
  colSpan,
  error,
  emptyText,
  onRetry,
}: {
  status: Exclude<TableStatus, "ok">;
  colSpan: number;
  error?: unknown;
  emptyText: string;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <tbody aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <tr key={i} className="border-b border-border last:border-b-0">
            <td colSpan={colSpan} className="px-4 py-3">
              <div className="h-6 animate-pulse rounded bg-muted" />
            </td>
          </tr>
        ))}
      </tbody>
    );
  }

  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-4 py-12 text-center">
          {status === "error" ? (
            <>
              <p role="alert" className="text-sm text-destructive">
                {isForbidden(error)
                  ? "Bạn không có quyền truy cập khu vực quản trị."
                  : "Không thể tải dữ liệu. Vui lòng kiểm tra kết nối."}
              </p>
              {!isForbidden(error) && (
                <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
                  Thử lại
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )}
        </td>
      </tr>
    </tbody>
  );
}