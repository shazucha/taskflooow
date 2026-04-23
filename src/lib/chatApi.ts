import { supabase } from "./supabase";
import type { ChatMessage, ChatScope } from "./types";

export async function fetchChatMessages(scope: ChatScope, projectId?: string | null): Promise<ChatMessage[]> {
  let q = supabase
    .from("chat_messages")
    .select("id, scope, project_id, author_id, body, image_url, created_at")
    .eq("scope", scope)
    .order("created_at", { ascending: true })
    .limit(200);
  if (scope === "project" && projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendChatMessage(input: {
  scope: ChatScope;
  project_id: string | null;
  author_id: string;
  body: string | null;
  image_url: string | null;
}) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function deleteChatMessage(id: string) {
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadChatImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return data.publicUrl;
}

export async function markChatRead(userId: string, scope: ChatScope, projectId: string | null) {
  // Use upsert against the unique index on (user_id, scope, project_id).
  // Previous SELECT-then-INSERT logic had a broken filter and caused infinite
  // 409 duplicate-key retries.
  const onConflict = projectId ? "user_id,scope,project_id" : "user_id,scope";
  const { error } = await supabase.from("chat_reads").upsert(
    {
      user_id: userId,
      scope,
      project_id: projectId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict, ignoreDuplicates: false }
  );
  if (error) {
    // Don't loop — just log. Unread badge can be slightly stale.
    console.warn("markChatRead failed:", error.message);
  }
}

export async function fetchChatReads(userId: string) {
  const { data, error } = await supabase
    .from("chat_reads")
    .select("scope, project_id, last_read_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}
