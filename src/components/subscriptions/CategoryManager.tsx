import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
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
import { emitSubsUpdated } from "@/lib/events";
import {
  deleteCategory,
  listCategories,
  updateCategory,
  type Category,
} from "@/lib/repo/categories";
import { listSubscriptions, updateSubscription } from "@/lib/repo/subscriptions";

const SWATCHES = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#71717a",
];

export function CategoryManager({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
}) {
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  async function rename(id: number, name: string) {
    await updateCategory(id, { name });
    await emitSubsUpdated();
  }

  async function recolor(id: number, color: string) {
    await updateCategory(id, { color });
    await emitSubsUpdated();
  }

  async function setEmoji(id: number, emoji: string) {
    await updateCategory(id, { emoji: emoji || null });
    await emitSubsUpdated();
  }

  async function move(id: number, direction: -1 | 1) {
    const ordered = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const idx = ordered.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    await updateCategory(a.id, { sort_order: b.sort_order });
    await updateCategory(b.id, { sort_order: a.sort_order });
    await emitSubsUpdated();
  }

  async function remove(id: number, reassignToOther: boolean) {
    if (reassignToOther) {
      const cats = await listCategories();
      const other = cats.find((c) => c.name === "Other");
      const subs = await listSubscriptions("all");
      for (const sub of subs) {
        if (sub.category_id === id) {
          await updateSubscription(sub.id, {
            category_id: other?.id ?? null,
          });
        }
      }
    }
    await deleteCategory(id);
    setPendingDelete(null);
    await emitSubsUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={cat.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== cat.name) {
                      void rename(cat.id, e.target.value.trim());
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void move(cat.id, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void move(cat.id, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="size-6 rounded-full ring-offset-2 ring-offset-[#0a0a0f]"
                    style={{
                      backgroundColor: color,
                      outline:
                        cat.color === color ? "2px solid white" : undefined,
                    }}
                    onClick={() => void recolor(cat.id, color)}
                  />
                ))}
              </div>
              <div className="mt-2 grid gap-1.5">
                <Label>Emoji</Label>
                <Input
                  defaultValue={cat.emoji ?? ""}
                  onBlur={(e) => void setEmoji(cat.id, e.target.value)}
                />
              </div>
              {pendingDelete === cat.id ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void remove(cat.id, true)}
                  >
                    Delete + reassign to Other
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void remove(cat.id, false)}
                  >
                    Delete only
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setPendingDelete(cat.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
