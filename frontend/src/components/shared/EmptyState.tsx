interface Props {
  message?: string;
}

export function EmptyState({ message = "Không có dữ liệu" }: Props) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
      {message}
    </div>
  );
}