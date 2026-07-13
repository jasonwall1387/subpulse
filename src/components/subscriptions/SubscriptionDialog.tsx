import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { emitSubsUpdated } from "@/lib/events";
import type { Category } from "@/lib/repo/categories";
import { createCategory } from "@/lib/repo/categories";
import {
  createSubscription,
  deleteSubscription,
  setStatus,
  updateSubscription,
  type Subscription,
  type SubscriptionInput,
} from "@/lib/repo/subscriptions";
import type { BillingCycle } from "@/lib/cycles";

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    priceDollars: z.string(),
    billing_cycle: z.enum([
      "weekly",
      "monthly",
      "quarterly",
      "annual",
      "custom",
    ]),
    cycle_days: z.string().optional(),
    next_renewal: z.string().optional(),
    auto_renews: z.boolean(),
    category_id: z.string().nullable(),
    payment_method: z.string().optional(),
    url: z.string().optional(),
    notes: z.string().optional(),
    is_trial: z.boolean(),
    trial_ends: z.string().optional(),
    icon_kind: z.enum(["auto", "simple", "emoji"]),
    icon_value: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const price = Number.parseFloat(val.priceDollars || "0");
    if (Number.isNaN(price) || price < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["priceDollars"],
        message: "Price must be >= 0",
      });
    }
    if (val.auto_renews && val.next_renewal) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val.next_renewal)) {
        ctx.addIssue({
          code: "custom",
          path: ["next_renewal"],
          message: "Use YYYY-MM-DD",
        });
      }
    }
  });

type FormState = z.infer<typeof formSchema>;

function emptyForm(): FormState {
  return {
    name: "",
    priceDollars: "0",
    billing_cycle: "monthly",
    cycle_days: "",
    next_renewal: "",
    auto_renews: true,
    category_id: null,
    payment_method: "",
    url: "",
    notes: "",
    is_trial: false,
    trial_ends: "",
    icon_kind: "auto",
    icon_value: "",
  };
}

function fromSub(sub: Subscription): FormState {
  return {
    name: sub.name,
    priceDollars: (sub.price_cents / 100).toFixed(2),
    billing_cycle: sub.billing_cycle,
    cycle_days: sub.cycle_days?.toString() ?? "",
    next_renewal: sub.next_renewal ?? "",
    auto_renews: sub.auto_renews === 1,
    category_id: sub.category_id?.toString() ?? null,
    payment_method: sub.payment_method ?? "",
    url: sub.url ?? "",
    notes: sub.notes ?? "",
    is_trial: sub.is_trial === 1,
    trial_ends: sub.trial_ends ?? "",
    icon_kind: sub.icon_kind,
    icon_value: sub.icon_value ?? "",
  };
}

export function SubscriptionDialog({
  open,
  onOpenChange,
  categories,
  subscription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  subscription: Subscription | null;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(subscription ? fromSub(subscription) : emptyForm());
    setError(null);
    setConfirmDelete(false);
    setNewCategoryName("");
  }, [open, subscription]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }
    const v = parsed.data;
    const priceCents = Math.round(Number.parseFloat(v.priceDollars || "0") * 100);
    const input: SubscriptionInput = {
      name: v.name.trim(),
      price_cents: priceCents,
      billing_cycle: v.billing_cycle as BillingCycle,
      cycle_days:
        v.billing_cycle === "custom" && v.cycle_days
          ? Number.parseInt(v.cycle_days, 10)
          : null,
      next_renewal: v.next_renewal || null,
      auto_renews: v.auto_renews,
      category_id: v.category_id ? Number.parseInt(v.category_id, 10) : null,
      payment_method: v.payment_method || null,
      url: v.url || null,
      notes: v.notes || null,
      is_trial: v.is_trial,
      trial_ends: v.trial_ends || null,
      icon_kind: v.icon_kind,
      icon_value: v.icon_value || null,
    };

    if (subscription) {
      await updateSubscription(subscription.id, input);
    } else {
      await createSubscription(input);
    }
    await emitSubsUpdated();
    onOpenChange(false);
  }

  async function handleArchive() {
    if (!subscription) return;
    await setStatus(subscription.id, "paused");
    await emitSubsUpdated();
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!subscription) return;
    await deleteSubscription(subscription.id);
    await emitSubsUpdated();
    onOpenChange(false);
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = await createCategory({ name, color: "#71717a" });
    setForm((prev) => ({ ...prev, category_id: String(id) }));
    setNewCategoryName("");
    await emitSubsUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {subscription ? "Edit subscription" : "Add subscription"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={form.category_id ?? ""}
              onChange={(e) =>
                patch("category_id", e.target.value || null)
              }
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input
                placeholder="New category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => void handleCreateCategory()}>
                Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price (USD)</Label>
              <Input
                id="price"
                value={form.priceDollars}
                onChange={(e) => patch("priceDollars", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cycle">Billing cycle</Label>
              <select
                id="cycle"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={form.billing_cycle}
                onChange={(e) =>
                  patch("billing_cycle", e.target.value as FormState["billing_cycle"])
                }
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="custom">Custom days</option>
              </select>
            </div>
          </div>

          {form.billing_cycle === "custom" && (
            <div className="grid gap-1.5">
              <Label htmlFor="cycle_days">Cycle days</Label>
              <Input
                id="cycle_days"
                value={form.cycle_days}
                onChange={(e) => patch("cycle_days", e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="next_renewal">Next renewal</Label>
            <Input
              id="next_renewal"
              type="date"
              value={form.next_renewal}
              onChange={(e) => patch("next_renewal", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto_renews">Auto-renews</Label>
            <Switch
              id="auto_renews"
              checked={form.auto_renews}
              onCheckedChange={(checked) => patch("auto_renews", checked)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="payment_method">Payment method</Label>
            <Input
              id="payment_method"
              value={form.payment_method}
              onChange={(e) => patch("payment_method", e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={form.url}
              onChange={(e) => patch("url", e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => patch("notes", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_trial">Trial</Label>
            <Switch
              id="is_trial"
              checked={form.is_trial}
              onCheckedChange={(checked) => patch("is_trial", checked)}
            />
          </div>

          {form.is_trial && (
            <div className="grid gap-1.5">
              <Label htmlFor="trial_ends">Trial ends</Label>
              <Input
                id="trial_ends"
                type="date"
                value={form.trial_ends}
                onChange={(e) => patch("trial_ends", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="icon_kind">Icon</Label>
              <select
                id="icon_kind"
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={form.icon_kind}
                onChange={(e) =>
                  patch("icon_kind", e.target.value as FormState["icon_kind"])
                }
              >
                <option value="auto">Auto</option>
                <option value="emoji">Emoji</option>
                <option value="simple">Simple icon slug</option>
              </select>
            </div>
            {form.icon_kind !== "auto" && (
              <div className="grid gap-1.5">
                <Label htmlFor="icon_value">Icon value</Label>
                <Input
                  id="icon_value"
                  value={form.icon_value}
                  onChange={(e) => patch("icon_value", e.target.value)}
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          {subscription ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void handleArchive()}>
                Archive
              </Button>
              {confirmDelete ? (
                <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
                  Confirm delete
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
