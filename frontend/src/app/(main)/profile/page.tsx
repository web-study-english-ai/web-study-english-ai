"use client";

import { PageContainer } from "@/components/shared/PageContainer";
import { useProfile } from "@/features/profile/hooks/useProfile";
import { ProfileHeaderCard } from "@/features/profile/components/ProfileHeaderCard";
import { ProfileForm } from "@/features/profile/components/ProfileForm";
import { ProfileError, ProfileSkeleton } from "@/features/profile/components/ProfileStates";

export default function ProfilePage() {
  const { data, isLoading, isError, refetch } = useProfile();

  return (
    <PageContainer>
      {isLoading && <ProfileSkeleton />}
      {isError && <ProfileError onRetry={() => refetch()} />}

      {data && (
        <div className="space-y-4">
          <ProfileHeaderCard name={data.name} email={data.email} avatarUrl={data.avatarUrl} />
          <ProfileForm profile={data} />
        </div>
      )}
    </PageContainer>
  );
}