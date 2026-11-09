import { mapList, Raw, str } from "@/features/admin/shared/lib/admin_mapper";
import { AdminUser } from "../types/users_types";

export function mapUser(raw: Raw): AdminUser {
  return {
    id: str(raw.id),
    fullName: str(raw.fullName ?? raw.name),
    email: str(raw.email),
    role: str(raw.role).toUpperCase(),
    isActive: raw.isActive !== false,
    createdAt: str(raw.createdAt),
  };
}

export const mapUserList = (raw: unknown, limit: number) => mapList(raw, mapUser, limit);