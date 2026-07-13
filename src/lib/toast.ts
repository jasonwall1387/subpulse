import { toast } from "sonner";

/** Standardized error toast for repo / connector failures. */
export function toastError(err: unknown, fallback = "Something went wrong"): void {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallback;
  toast.error(message || fallback);
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
