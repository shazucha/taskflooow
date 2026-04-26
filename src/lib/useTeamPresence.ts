import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";

const TEAM_PRESENCE_CHANNEL = "presence-team-global";

/**
 * Global team presence — tracks every user that has the app open.
 * Returns a Set of online user ids (including self).
 */
export function useTeamPresence(): Set<string> {
  const userId = useCurrentUserId();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(TEAM_PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, at: Date.now() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return online;
}