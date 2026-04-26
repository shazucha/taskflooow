import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";
import { fetchUnreadByPeer } from "./dmApi";

/**
 * Returns a map of peerId -> unread DM count, plus total.
 * Subscribes to inserts on direct_messages and updates on direct_message_reads.
 */
export function useUnreadDirect(): { counts: Record<string, number>; total: number; refresh: () => void } {
  const userId = useCurrentUserId();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const c = await fetchUnreadByPeer(userId);
      setCounts(c);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const channel = supabase
      .channel(`unread-direct-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_message_reads",
          filter: `user_id=eq.${userId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total, refresh };
}