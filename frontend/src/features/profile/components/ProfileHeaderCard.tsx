import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export function ProfileHeaderCard({ name, email, avatarUrl }: Props) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(-2)
      .join("")
      .toUpperCase() || "?";

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6">
      <Avatar className="h-16 w-16">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="bg-orange-100 text-lg font-semibold text-orange-600">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <h1 className="truncate font-heading text-xl font-bold text-foreground">{name}</h1>
        <p className="truncate text-sm text-muted-foreground">{email}</p>
      </div>
    </section>
  );
}