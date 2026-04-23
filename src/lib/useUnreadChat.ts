import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";
import { fetchChatReads } from "./chatApi";

interface UnreadCounts {
  team: number;
  total: number;
}

/**
 * Returns count of unread team chat messages (since last read).
 */
export function useUnreadTeamChat(): number {
  const userId = useCurrentUserId();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    const refresh = async () => {
      const reads = await fetchChatReads(userId);
      const teamRead = reads.find((r) => r.scope === "team");
      const since = teamRead?.last_read_at ?? "1970-01-01T00:00:00Z";

      const { count: c } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("scope", "team")
        .gt("created_at", since)
        .neq("author_id", userId);
      if (mounted) setCount(c ?? 0);
    };

    refresh();

    const channel = supabase
      .channel(`unread-team-chat-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: "scope=eq.team" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
