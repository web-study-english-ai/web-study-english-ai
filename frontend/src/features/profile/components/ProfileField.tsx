interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border-none bg-muted/70 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 disabled:opacity-60 read-only:opacity-70";