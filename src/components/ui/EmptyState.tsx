import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
};

/** One-line empty state with optional CTA (button or in-app link). */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  to,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-10 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      {actionLabel && to && (
        <Link
          to={to}
          className="mt-4 inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !to && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
