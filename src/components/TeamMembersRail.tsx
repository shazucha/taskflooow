import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { DirectChatPanel } from "@/components/DirectChatPanel";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useTeamPresence } from "@/lib/useTeamPresence";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Always-visible thin rail on the right side (desktop only) showing all team members
 * with online status and unread DM badges. Clicking a member opens a sliding chat panel.
 */
export function TeamMembersRail() {
  const isMobile = useIsMobile();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const onlineIds = useTeamPresence();
  const { counts, total } = useUnreadDirect();
  const [openPeer, setOpenPeer] = useState<Profile | null>(null);

  if (isMobile) return null;
  if (!currentUserId) return null;

  // Sort: unread first, then online, then alphabetic
  const others = profiles
    .filter((p) => p.id !== currentUserId)
    .sort((a, b) => {
      const ua = counts[a.id] ?? 0;
      const ub = counts[b.id] ?? 0;
      if (ua !== ub) return ub - ua;
      const oa = onlineIds.has(a.id) ? 1 : 0;
      const ob = onlineIds.has(b.id) ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "");
    });

  return (
    <>
      {/* Always-visible rail (desktop only) */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-16 flex-col border-l border-border/60 bg-card/60 backdrop-blur-xl md:flex">
        <div className="flex items-center justify-center gap-1 border-b border-border/60 py-3">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          {total > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-2">
            {others.map((p) => {
              const online = onlineIds.has(p.id);
              const unread = counts[p.id] ?? 0;
              const active = openPeer?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenPeer(p)}
                    className={cn(
                      "group relative flex w-full flex-col items-center gap-1 rounded-xl p-1.5 transition",
                      active ? "bg-primary-soft" : "hover:bg-surface-muted"
                    )}
                    title={`${p.full_name ?? p.email ?? "?"}${online ? " · online" : ""}`}
                  >
                    <span className="relative">
                      <UserAvatar profile={p} size="md" />
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                          online ? "bg-success" : "bg-muted-foreground/40"
                        )}
                      />
                      {unread > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-1 max-w-[3.5rem] text-[9px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                      {(p.full_name ?? p.email ?? "?").split(" ")[0]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Sliding chat panel */}
      {openPeer && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Zavrieť chat"
            onClick={() => setOpenPeer(null)}
            className="fixed inset-0 z-40 hidden bg-black/20 backdrop-blur-sm md:block"
          />
          <div className="fixed inset-y-0 right-16 z-50 hidden w-[360px] animate-in slide-in-from-right border-l border-border/60 shadow-2xl md:flex">
            <DirectChatPanel
              peer={openPeer}
              isOnline={onlineIds.has(openPeer.id)}
              onClose={() => setOpenPeer(null)}
            />
          </div>
        </>
      )}
    </>
  );
}