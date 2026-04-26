import { supabase } from "./supabase";
import type { DirectMessage } from "./types";

/** Stable conversation key: smaller uuid first, joined with ":". */
export function conversationKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Uploads a DM image to the shared chat-attachments bucket. */
export async function uploadDirectImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `dm/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchDirectMessages(meId: string, peerId: string): Promise<DirectMessage[]> {
  const key = conversationKey(meId, peerId);
  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, recipient_id, body, image_url, created_at")
    .eq("conversation_key", key)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as DirectMessage[];
}

export async function sendDirectMessage(input: {
  sender_id: string;
  recipient_id: string;
  body: string | null;
  image_url: string | null;
}): Promise<DirectMessage> {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert(input)
    .select("id, sender_id, recipient_id, body, image_url, created_at")
    .single();
  if (error) throw error;
  return data as DirectMessage;
}

export async function deleteDirectMessage(id: string): Promise<void> {
  const { error } = await supabase.from("direct_messages").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchDirectReads(userId: string) {
  const { data, error } = await supabase
    .from("direct_message_reads")
    .select("user_id, peer_id, last_read_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

export async function markDirectRead(userId: string, peerId: string) {
  const now = new Date().toISOString();
  const { data: existing, error: selErr } = await supabase
    .from("direct_message_reads")
    .select("user_id")
    .eq("user_id", userId)
    .eq("peer_id", peerId)
    .maybeSingle();
  if (selErr) {
    console.warn("markDirectRead select failed:", selErr.message);
    return;
  }
  if (existing) {
    const { error } = await supabase
      .from("direct_message_reads")
      .update({ last_read_at: now })
      .eq("user_id", userId)
      .eq("peer_id", peerId);
    if (error) console.warn("markDirectRead update failed:", error.message);
  } else {
    const { error } = await supabase
      .from("direct_message_reads")
      .insert({ user_id: userId, peer_id: peerId, last_read_at: now });
    if (error && (error as { code?: string }).code !== "23505") {
      console.warn("markDirectRead insert failed:", error.message);
    }
  }
}

/**
 * Returns a map peerId -> unread count for the given user.
 * Counts only messages received from peer after last_read_at for that peer.
 */
export async function fetchUnreadByPeer(userId: string): Promise<Record<string, number>> {
  const [readsRes, msgsRes] = await Promise.all([
    supabase
      .from("direct_message_reads")
      .select("peer_id, last_read_at")
      .eq("user_id", userId),
    supabase
      .from("direct_messages")
      .select("sender_id, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (readsRes.error) throw readsRes.error;
  if (msgsRes.error) throw msgsRes.error;

  const readsMap = new Map<string, string>();
  for (const r of readsRes.data ?? []) readsMap.set(r.peer_id, r.last_read_at);

  const counts: Record<string, number> = {};
  for (const m of msgsRes.data ?? []) {
    const since = readsMap.get(m.sender_id) ?? "1970-01-01T00:00:00Z";
    if (m.created_at > since) counts[m.sender_id] = (counts[m.sender_id] ?? 0) + 1;
  }
  return counts;
}