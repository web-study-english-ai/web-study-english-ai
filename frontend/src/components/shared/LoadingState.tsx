interface Props {
  text?: string;
}

export function LoadingState({ text = "Đang tải..." }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm">{text}</p>
    </div>
  );
}