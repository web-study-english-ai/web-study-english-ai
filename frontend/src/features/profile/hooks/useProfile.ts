"use client";

import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../api/profile_api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 60_000,
  });
}