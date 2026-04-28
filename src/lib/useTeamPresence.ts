import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";

const TEAM_PRESENCE_CHANNEL = "presence-team-global";

/**
 * SINGLETON presence channel.
 *
 * Supabase's JS client does NOT deduplicate `supabase.channel(name)` calls —
 * each call creates a new channel object, and only ONE of them actually
 * subscribes to a given topic on the server. If multiple components mount
 * `useTeamPresence` (e.g. TeamMembersRail + Messages page), every instance
 * after the first ends up with an empty `presenceState()` and shows everyone
 * as offline.
 *
 * We work around this by maintaining a single shared channel per userId and
 * fanning state out to all subscribers via a listener set.
 */

type Listener = (ids: Set<string>) => void;

let sharedChannel: RealtimeChannel | null = null;
let sharedUserId: string | null = null;
let sharedState: Set<string> = new Set();
const listeners = new Set<Listener>();
let refCount = 0;

function notify() {
  for (const fn of listeners) fn(sharedState);
}

function recomputeFromChannel(channel: RealtimeChannel) {
  const state = channel.presenceState() as Record<string, unknown[]>;
  sharedState = new Set(Object.keys(state));
  notify();
}

function ensureChannel(userId: string) {
  if (sharedChannel && sharedUserId === userId) return sharedChannel;
  // Tear down any previous channel (e.g. user switched accounts).
  if (sharedChannel) {
    sharedChannel.untrack().catch(() => {});
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
    sharedState = new Set();
    notify();
  }
  sharedUserId = userId;
  const channel = supabase.channel(TEAM_PRESENCE_CHANNEL, {
    config: { presence: { key: userId } },
  });
  channel
    .on("presence", { event: "sync" }, () => recomputeFromChannel(channel))
    .on("presence", { event: "join" }, () => recomputeFromChannel(channel))
    .on("presence", { event: "leave" }, () => recomputeFromChannel(channel))
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ user_id: userId, at: Date.now() }).catch(() => {});
      }
    });
  sharedChannel = channel;
  return channel;
}

/**
 * Global team presence — tracks every user that has the app open.
 * Returns a Set of online user ids (including self).
 */
export function useTeamPresence(): Set<string> {
  const userId = useCurrentUserId();
  const [online, setOnline] = useState<Set<string>>(sharedState);

  useEffect(() => {
    if (!userId) return;
    ensureChannel(userId);
    const listener: Listener = (ids) => setOnline(ids);
    listeners.add(listener);
    refCount += 1;
    // Push current state immediately so a late mount doesn't wait for next sync.
    setOnline(sharedState);
    return () => {
      listeners.delete(listener);
      refCount -= 1;
      if (refCount <= 0 && sharedChannel) {
        sharedChannel.untrack().catch(() => {});
        supabase.removeChannel(sharedChannel);
        sharedChannel = null;
        sharedUserId = null;
        sharedState = new Set();
      }
    };
  }, [userId]);

  return online;
}