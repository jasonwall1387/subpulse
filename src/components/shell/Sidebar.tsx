import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  Settings,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useCategories, useSubscriptions } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/usage", label: "AI Usage", icon: Sparkles },
  { to: "/subscriptions", label: "All Subscriptions", icon: WalletCards },
];

export function Sidebar() {
  const { data: categories = [] } = useCategories();
  const { data: subs = [] } = useSubscriptions("all");

  const countByCategory = new Map<number, number>();
  for (const sub of subs) {
    if (sub.category_id == null) continue;
    countByCategory.set(
      sub.category_id,
      (countByCategory.get(sub.category_id) ?? 0) + 1,
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.08] bg-black/20 px-3 py-4">
      <div className="mb-6 px-2 text-lg font-semibold tracking-tight">
        SubPulse
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100",
                isActive && "bg-white/10 text-zinc-100",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="mt-6 mb-2 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Categories
        </div>
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-zinc-400"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            <span className="truncate">
              {cat.name} ({countByCategory.get(cat.id) ?? 0})
            </span>
          </div>
        ))}
      </nav>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(
            "mt-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.07] hover:text-zinc-100",
            isActive && "bg-white/10 text-zinc-100",
          )
        }
      >
        <Settings className="size-4" />
        Settings
      </NavLink>
    </aside>
  );
}
