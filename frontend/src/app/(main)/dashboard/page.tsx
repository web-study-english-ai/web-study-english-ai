"use client";

import Image from "next/image";
import { useDueReviewReminder } from "@/features/reviews/hooks/useDueReviewReminder";
import { ReviewReminderDialog } from "@/features/reviews/components/ReviewReminderDialog";
import { ReviewReminderSkeleton } from "@/features/reviews/components/ReviewReminderSkeleton";

export default function DashboardPage() {
  const { dueCount, isLoading, shouldShow, dismiss } = useDueReviewReminder();

  return (
    <>


      {shouldShow && dueCount !== null && (
        <ReviewReminderDialog open={shouldShow} dueCount={dueCount} onDismiss={dismiss} />
      )}

      <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden">
        <Image
          src="/images/dashboard.jpeg"
          alt="Học tiếng Anh"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-teal-900/30" />
        <div className="absolute inset-0 bg-teal-900/30" />
        {isLoading && (
          <div className="absolute left-4 top-4 z-10 w-72">
            <ReviewReminderSkeleton />
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="font-heading text-2xl font-semibold text-white drop-shadow-lg sm:text-3xl">
            Chào mừng bạn quay lại
          </p>
          <p className="mt-2 max-w-md text-sm text-white/90 drop-shadow">
            Hãy tiếp tục hành trình học tập hôm nay.
          </p>
        </div>
      </div>
    </>
  );
}