"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { loginApi, registerApi, logoutApi, toAuthError } from "../api/auth_api";
import { AuthError, LoginPayload, RegisterPayload, User } from "../types/auth_types";

const USER_KEY = "auth_user";
const SESSION_COOKIE = "has_session";

function persistSession(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
  window.dispatchEvent(new Event("auth-user-updated"));
}

function clearSession() {
  localStorage.removeItem(USER_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event("auth-user-updated"));
}

export function useAuth() {
  const router = useRouter();

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      try {
        return await loginApi(payload);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (res) => {
      persistSession(res.user);
      router.push("/dashboard");
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      try {
        await registerApi(payload);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: () => {
      router.push("/login?registered=1");
    },
  });

  async function logout() {
    try {
      await logoutApi();
    } finally {
      clearSession();
      router.push("/");
    }
  }

  function updateUser(updates: Partial<User>) {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const current: User = JSON.parse(raw);
    const updated = { ...current, ...updates };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("auth-user-updated"));
  }

    return {
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout,
    updateUser,
    isLoading: loginMutation.isPending || registerMutation.isPending,
    error: (loginMutation.error ?? registerMutation.error) as AuthError | null,
  };
}