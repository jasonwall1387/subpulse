import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlanCard } from "@/components/usage/PlanCard";
import { getBuckets, listPlans } from "@/lib/repo/usage";

export function UsageView() {
  const queryClient = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["usage-plans"],
    queryFn: () => listPlans(),
  });

  const { data: bucketsByPlan = {} } = useQuery({
    queryKey: ["usage-buckets", plans.map((p) => p.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        plans.map(async (p) => [p.id, await getBuckets(p.id)] as const),
      );
      return Object.fromEntries(entries) as Record<
        number,
        Awaited<ReturnType<typeof getBuckets>>
      >;
    },
    enabled: plans.length > 0,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["usage-plans"] });
    void queryClient.invalidateQueries({ queryKey: ["usage-buckets"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">AI Usage</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Plan limit bars - manual now, live connectors later.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            buckets={bucketsByPlan[plan.id] ?? []}
            onChanged={refresh}
          />
        ))}
      </div>
      {plans.length === 0 && (
        <p className="text-sm text-zinc-500">
          No usage plans yet. Load seed data from Settings.
        </p>
      )}
    </div>
  );
}
