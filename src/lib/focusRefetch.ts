import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueryClient } from "@tanstack/react-query";

/** Invalidate live data when the window is shown/focused again. */
export function setupFocusRefetch(queryClient: QueryClient): () => void {
  const win = getCurrentWindow();
  let unlisten: (() => void) | undefined;
  void win
    .onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["usage-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["usage-buckets"] });
      void queryClient.invalidateQueries({ queryKey: ["usage-all-buckets"] });
    })
    .then((fn) => {
      unlisten = fn;
    });
  return () => {
    unlisten?.();
  };
}
