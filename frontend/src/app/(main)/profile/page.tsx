"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { useProfile } from "@/features/profile/hooks/useProfile";
import { ProfileForm } from "@/features/profile/components/ProfileForm";
import { ProfileError, ProfileSkeleton } from "@/features/profile/components/ProfileStates";

export default function ProfilePage() {
  const { data, isLoading, isError, refetch } = useProfile();

  return (
    <PageContainer>
      {isLoading && <ProfileSkeleton />}
      {isError && <ProfileError onRetry={() => refetch()} />}

      {/* Header (ảnh đại diện + dark mode) nằm bên trong form để dùng chung trạng thái */}
      {data && <ProfileForm profile={data} />}
    </PageContainer>
  );
}