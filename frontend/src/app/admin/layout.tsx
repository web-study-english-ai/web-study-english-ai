import { AdminSidebar } from "@/features/admin/shared/components/AdminSidebar";
import { AdminHeader } from "@/features/admin/shared/components/AdminHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto bg-muted/40">{children}</main>
      </div>
    </div>
  );
}