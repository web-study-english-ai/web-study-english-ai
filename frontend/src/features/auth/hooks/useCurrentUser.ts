"use client";

import { useSyncExternalStore } from "react";
import { User } from "../types/auth_types";

const USER_KEY = "auth_user";

let cachedRaw: string | null = null;
let cachedUser: User | null = null;

function getSnapshot(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === cachedRaw) return cachedUser;

  cachedRaw = raw;
  if (!raw) {
    cachedUser = null;
    return cachedUser;
  }
  try {
    cachedUser = JSON.parse(raw);
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

function getServerSnapshot(): User | null {
  return null;
}

function subscribe(callback: () => void) {
  window.addEventListener("auth-user-updated", callback);
  return () => window.removeEventListener("auth-user-updated", callback);
}

export function useCurrentUser() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}