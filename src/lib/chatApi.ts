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
  // Try update first
  const projFilter = projectId ?? null;
  const { data: existing } = await supabase
    .from("chat_reads")
    .select("id")
    .eq("user_id", userId)
    .eq("scope", scope)
    .is("project_id", projFilter === null ? null : undefined)
    .eq("project_id", projFilter ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("chat_reads").update({ last_read_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("chat_reads").insert({
      user_id: userId,
      scope,
      project_id: projectId,
      last_read_at: new Date().toISOString(),
    });
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
