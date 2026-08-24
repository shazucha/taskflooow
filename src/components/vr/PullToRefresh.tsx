import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 70;

/**
 * Jednoduché „potiahni na obnovenie“ pre mobilné zoznamy.
 * Aktivuje sa iba pri dotyku a keď je stránka odscrollovaná úplne hore.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  className?: string;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const atTop = () =>
    (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  const onTouchStart = (e: React.TouchEvent) => {
    if (busy || !atTop()) return;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || busy) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0 || !atTop()) {
      setPull(0);
      return;
    }
    // Tlmený ťah, aby pôsobil prirodzene.
    setPull(Math.min(THRESHOLD * 1.6, delta * 0.5));
  };

  const onTouchEnd = async () => {
    const reached = pull >= THRESHOLD;
    startY.current = null;
    if (!reached) {
      setPull(0);
      return;
    }
    setBusy(true);
    setPull(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
      setPull(0);
    }
  };

  return (
    <div
      className={cn("relative min-w-0", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden text-xs text-muted-foreground transition-[height] duration-150"
        style={{ height: pull }}
        aria-hidden={pull === 0}
      >
        {pull > 0 && (
          <span className="flex items-center gap-2">
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            {busy ? "Obnovujem…" : pull >= THRESHOLD ? "Pustite pre obnovenie" : "Potiahnite pre obnovenie"}
          </span>
        )}
      </div>
      <div style={{ transform: `translateY(${pull ? 0 : 0}px)` }}>{children}</div>
    </div>
  );
}
