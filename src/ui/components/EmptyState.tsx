export function EmptyState({ message }: { message: string }) {
  return (
    <div className="notice center muted" role="status">
      {message}
    </div>
  );
}
