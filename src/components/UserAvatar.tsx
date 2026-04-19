import { forwardRef } from "react";
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

const fallbackPalette = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  return source
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fallbackColor(id?: string) {
  if (!id) return fallbackPalette[0];
  let n = 0;
  for (const c of id) n = (n + c.charCodeAt(0)) % fallbackPalette.length;
  return fallbackPalette[n];
}

export const UserAvatar = forwardRef<HTMLSpanElement, Props>(
  ({ profile, size = "md", className }, ref) => {
    const bg = profile?.color || fallbackColor(profile?.id);
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background",
          sizes[size],
          className
        )}
        style={{ backgroundColor: bg }}
        title={profile?.full_name ?? ""}
      >
        {initials(profile?.full_name, profile?.email)}
      </span>
    );
  }
);
UserAvatar.displayName = "UserAvatar";
