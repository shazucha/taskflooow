import { useState } from "react";
import { MessageCircle, Users2, X } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { DirectChatPanel } from "@/components/DirectChatPanel";
import { Chat } from "@/components/Chat";
import { Button } from "@/components/ui/button";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useTeamPresence } from "@/lib/useTeamPresence";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import { useUnreadTeamChat } from "@/lib/useUnreadChat";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Always-visible thin rail on the right side (desktop only) showing all team members
 * with online status and unread DM badges. Clicking a member opens a sliding chat panel.
 */
export function TeamMembersRail() {
  // Always call hooks unconditionally — only the *visual* output is hidden on mobile.
  // Returning null before hooks would change the hook order between renders and trigger
  // React's "Should have a queue" error during HMR/viewport changes.
  const isMobile = useIsMobile();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const onlineIds = useTeamPresence();
  const { counts, total } = useUnreadDirect();
  const teamUnread = useUnreadTeamChat();
  const [openPeer, setOpenPeer] = useState<Profile | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);

  if (isMobile || !currentUserId) return null;

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
            {/* Team chat pseudo-member */}
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpenPeer(null);
                  setTeamOpen(true);
                }}
                className={cn(
                  "group relative flex w-full flex-col items-center gap-1 rounded-xl p-1.5 transition",
                  teamOpen ? "bg-primary-soft" : "hover:bg-surface-muted"
                )}
                title="Tímový chat"
              >
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Users2 className="h-5 w-5" strokeWidth={2.2} />
                  {teamUnread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {teamUnread > 9 ? "9+" : teamUnread}
                    </span>
                  )}
                </span>
                <span className="line-clamp-1 max-w-[3.5rem] text-[9px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                  Tím
                </span>
              </button>
            </li>
            <li className="mx-2 my-1 border-t border-border/60" aria-hidden />
            {others.map((p) => {
              const online = onlineIds.has(p.id);
              const unread = counts[p.id] ?? 0;
              const active = openPeer?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTeamOpen(false);
                      setOpenPeer(p);
                    }}
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
        <div
          className="fixed inset-y-0 right-16 z-40 hidden w-[360px] flex-col animate-in slide-in-from-right-4 border-l border-border/60 bg-card shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.18)] md:flex"
          role="dialog"
          aria-label={`Chat s ${openPeer.full_name ?? openPeer.email ?? "používateľom"}`}
        >
          <DirectChatPanel
            peer={openPeer}
            isOnline={onlineIds.has(openPeer.id)}
            onClose={() => setOpenPeer(null)}
          />
        </div>
      )}

      {/* Sliding TEAM chat panel */}
      {teamOpen && (
        <div
          className="fixed inset-y-0 right-16 z-40 hidden w-[360px] flex-col animate-in slide-in-from-right-4 border-l border-border/60 bg-card shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.18)] md:flex"
          role="dialog"
          aria-label="Tímový chat"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Users2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Tímový chat</p>
              <p className="text-[11px] text-muted-foreground">Všetci členovia tímu</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setTeamOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <Chat scope="team" className="h-full" />
          </div>
        </div>
      )}
    </>
  );
}