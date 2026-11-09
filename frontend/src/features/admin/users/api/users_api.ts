import { apiFetch } from "@/lib/api/client";
import { ListResult } from "@/features/admin/shared/types/admin_types";
import { AdminUser, UpdateUserBody, UserListParams } from "../types/users_types";
import { mapUserList } from "./users_mapper";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function getAdminUsers(params: UserListParams): Promise<ListResult<AdminUser>> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.role !== "all") q.set("role", params.role);
  if (params.status !== "all") q.set("status", params.status);

  const raw = await apiFetch<unknown>(`/admin/users?${q.toString()}`);
  return mapUserList(raw, params.limit);
}

export async function updateAdminUser(id: string, body: UpdateUserBody): Promise<void> {
  await apiFetch<unknown>(`/admin/users/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}