import { useQuery } from "@tanstack/react-query";
import { listCategories } from "@/lib/repo/categories";
import { listSubscriptions } from "@/lib/repo/subscriptions";

export function useSubscriptions(
  filter: "active" | "all" | "trials" | "inactive" = "all",
) {
  return useQuery({
    queryKey: ["subscriptions", filter],
    queryFn: () => listSubscriptions(filter),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
}
