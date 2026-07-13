import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard";
import { SubscriptionDialog } from "@/components/subscriptions/SubscriptionDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCategories, useSubscriptions } from "@/lib/hooks";
import type { Subscription } from "@/lib/repo/subscriptions";
import { cn } from "@/lib/utils";

type FilterChip = "active" | "trials" | "inactive" | "all";

const chips: Array<{ id: FilterChip; label: string }> = [
  { id: "active", label: "Active" },
  { id: "trials", label: "Trials" },
  { id: "inactive", label: "Paused + Canceled" },
  { id: "all", label: "All" },
];

export function SubscriptionsView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterChip>("active");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  const listFilter =
    filter === "active"
      ? "active"
      : filter === "trials"
        ? "trials"
        : filter === "inactive"
          ? "inactive"
          : "all";

  const { data: subs = [] } = useSubscriptions(listFilter);
  const { data: categories = [] } = useCategories();

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => s.name.toLowerCase().includes(q));
  }, [subs, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Subscription[]>();
    for (const sub of filtered) {
      const cat =
        sub.category_id != null ? catById.get(sub.category_id) : undefined;
      const key = cat?.name ?? "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(sub);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, catById]);

  useEffect(() => {
    const state = location.state as { openNew?: boolean } | null;
    if (state?.openNew) {
      setEditing(null);
      setDialogOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditing(null);
        setDialogOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Subscriptions</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Search, filter, and manage renewals.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add subscription
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.07]",
                filter === chip.id && "bg-white/10 text-zinc-100",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {grouped.map(([categoryName, items]) => {
          const cat = categories.find((c) => c.name === categoryName);
          return (
            <section key={categoryName}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                {cat && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                )}
                {categoryName}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    category={
                      sub.category_id != null
                        ? catById.get(sub.category_id)
                        : undefined
                    }
                    onClick={() => {
                      setEditing(sub);
                      setDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {grouped.length === 0 && (
          <EmptyState
            title="No subscriptions yet"
            description="Add your first subscription to track renewals and spend."
            actionLabel="Add subscription"
            onAction={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
        )}
      </div>

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        subscription={editing}
      />
    </div>
  );
}
