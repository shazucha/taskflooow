import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = { className?: string; withLabel?: boolean };

/** Prepínač svetlej/tmavej témy — dostupný z klávesnice, so správnym ARIA stavom. */
export function ThemeToggle({ className, withLabel = false }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          role="switch"
          aria-checked={isDark}
          aria-label={label}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
            className
          )}
        >
          {isDark ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
          {withLabel && <span>{isDark ? "Tmavý režim" : "Svetlý režim"}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
