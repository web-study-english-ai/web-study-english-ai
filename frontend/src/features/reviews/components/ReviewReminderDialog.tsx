"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface Props {
  open: boolean;
  dueCount: number;
  onDismiss: () => void;
}

export function ReviewReminderDialog({ open, dueCount, onDismiss }: Props) {
  const router = useRouter();

  function goToReview() {
    onDismiss();
    router.push("/reviews");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent className="border-none bg-[#12172B] p-8 text-center sm:max-w-md [&>button]:hidden">
               <div className="absolute right-4 top-4">
          <button
            onClick={onDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white"
            aria-label="Đóng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

       <DialogTitle className="font-heading text-lg font-semibold text-white">
  Đến giờ ôn tập!
</DialogTitle>

        <div className="my-5 flex justify-center">
  <Image src="/images/robot1.png" alt="Trợ lý ôn tập" width={112} height={112} />
</div>

        <p className="text-sm text-white/90">
          Bạn có <span className="font-bold text-primary">{dueCount}</span> từ vựng cần được ôn lại
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/60">
          Ôn tập thường xuyên giúp củng cố kiến thức và cải thiện kỹ năng của bạn. Hãy dành vài
          phút để ôn tập ngay!
        </p>

                <div className="mt-5">
          <Button
            onClick={goToReview}
            className="w-full rounded-lg bg-primary py-5 font-semibold uppercase tracking-wide text-primary-foreground hover:bg-primary/90"
          >
            Ôn tập từ vựng ({dueCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}