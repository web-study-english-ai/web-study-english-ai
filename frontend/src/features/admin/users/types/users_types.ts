export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserListParams {
  page: number;
  limit: number;
  search: string;
  role: string; // "all" | "ADMIN" | "USER"
  status: string; // "all" | "ACTIVE" | "LOCKED"
}

export interface UpdateUserBody {
  fullName?: string;
  role?: string;
  isActive?: boolean;
}