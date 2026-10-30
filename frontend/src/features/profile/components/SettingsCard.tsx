export function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}