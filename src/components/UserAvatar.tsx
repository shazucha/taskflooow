import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface Props {
  profile?: Profile | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

const palette = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function colorFor(id?: string) {
  if (!id) return palette[0];
  let n = 0;
  for (const c of id) n = (n + c.charCodeAt(0)) % palette.length;
  return palette[n];
}

export function UserAvatar({ profile, size = "md", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-background",
        sizes[size],
        colorFor(profile?.id),
        className
      )}
      title={profile?.full_name ?? ""}
    >
      {initials(profile?.full_name)}
    </span>
  );
}
