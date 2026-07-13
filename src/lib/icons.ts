import * as simpleIcons from "simple-icons";
import type { Subscription } from "@/lib/repo/subscriptions";

type IconLike = {
  slug: string;
  path: string;
  hex: string;
  title: string;
};

function isIconLike(v: unknown): v is IconLike {
  return (
    typeof v === "object" &&
    v !== null &&
    "slug" in v &&
    "path" in v &&
    "hex" in v &&
    "title" in v
  );
}

const iconIndex: IconLike[] = Object.values(simpleIcons).filter(isIconLike);

export type ResolvedIcon =
  | { kind: "simple"; svgPath: string; hex: string }
  | { kind: "emoji"; char: string };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveIcon(
  sub: Pick<Subscription, "name" | "icon_kind" | "icon_value">,
): ResolvedIcon {
  if (sub.icon_kind === "emoji" && sub.icon_value) {
    return { kind: "emoji", char: sub.icon_value };
  }
  if (sub.icon_kind === "simple" && sub.icon_value) {
    const match = iconIndex.find((i) => i.slug === sub.icon_value);
    if (match) {
      return { kind: "simple", svgPath: match.path, hex: `#${match.hex}` };
    }
  }

  const needle = normalize(sub.name);
  const match = iconIndex.find(
    (i) =>
      normalize(i.slug) === needle ||
      normalize(i.title) === needle ||
      needle.includes(normalize(i.slug)) ||
      normalize(i.slug).includes(needle),
  );
  if (match) {
    return { kind: "simple", svgPath: match.path, hex: `#${match.hex}` };
  }
  return { kind: "emoji", char: "\u{1F4B3}" };
}
