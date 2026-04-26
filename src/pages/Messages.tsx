import { useState } from "react";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { DirectChatPanel } from "@/components/DirectChatPanel";
import { Chat } from "@/components/Chat";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useSession } from "@/lib/useSession";
import { useTeamPresence } from "@/lib/useTeamPresence";
import { useUnreadDirect } from "@/lib/useUnreadDirect";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { loading } = useSession();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const onlineIds = useTeamPresence();
  const { counts } = useUnreadDirect();
  const [openPeer, setOpenPeer] = useState<Profile | null>(null);

  if (loading || profilesLoading || !currentUserId) {
    return (
      <div className="page-container flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

  // Mobile: full-screen conversation when a peer is selected
  if (openPeer) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-card md:static md:inset-auto md:z-auto">
        <button
          type="button"
          onClick={() => setOpenPeer(null)}
          className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> Späť na členov
        </button>
        <div className="flex-1 overflow-hidden">
          <DirectChatPanel
            peer={openPeer}
            isOnline={onlineIds.has(openPeer.id)}
            onClose={() => setOpenPeer(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container pb-6">
      <header className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Chat</h1>
      </header>

      <section className="mb-6">
        <Chat scope="team" />
      </section>

      <h2 className="mb-3 text-base font-semibold">Súkromné správy</h2>
      <p className="mb-4 text-xs text-muted-foreground">Kliknutím na člena otvoríš súkromný chat.</p>

      <ul className="space-y-2">
        {others.map((p) => {
          const online = onlineIds.has(p.id);
          const unread = counts[p.id] ?? 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpenPeer(p)}
                className="card-elevated flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-muted"
              >
                <span className="relative">
                  <UserAvatar profile={p} size="md" />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                      online ? "bg-success" : "bg-muted-foreground/40"
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.full_name ?? p.email}</p>
                  <p className="text-[11px] text-muted-foreground">{online ? "Online" : "Offline"}</p>
                </div>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {others.length === 0 && (
          <li className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Žiadni iní členovia tímu.
          </li>
        )}
      </ul>
    </div>
  );
}