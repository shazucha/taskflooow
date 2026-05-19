import { supabase } from "./supabase";
import type { ChatMessage, ChatScope } from "./types";
import { notifyUsers } from "./push";

export async function fetchChatMessages(
  scope: ChatScope,
  projectId?: string | null,
  monthKey?: string | null,
): Promise<ChatMessage[]> {
  let q = supabase
    .from("chat_messages")
    .select("id, scope, project_id, author_id, body, image_url, created_at, month_key")
    .eq("scope", scope)
    .order("created_at", { ascending: true })
    .limit(200);
  if (scope === "project" && projectId) q = q.eq("project_id", projectId);
  if (scope === "project" && monthKey) q = q.eq("month_key", monthKey);
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
  month_key?: string | null;
}) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  // Push do tímového chatu — všetkým ostatným členom.
  if (input.scope === "team") {
    try {
      const [{ data: author }, { data: others }] = await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", input.author_id).maybeSingle(),
        supabase.from("profiles").select("id").neq("id", input.author_id),
      ]);
      const name = author?.full_name?.trim() || author?.email || "Niekto";
      const preview = input.body?.trim() || (input.image_url ? "📷 Fotka" : "Nová správa v tíme");
      const ids = (others ?? []).map((p) => p.id as string);
      void notifyUsers({
        user_ids: ids,
        title: `${name} v tímovom chate`,
        body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
        url: "/chat",
        tag: "team-chat",
      });
    } catch { /* ignore */ }
  }
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
  // SELECT-then-UPDATE/INSERT. Predošlá verzia mala rozbitý filter
  // (.is + .eq súčasne na project_id), takže SELECT vždy vrátil 0 a INSERT
  // padol s 409 v nekonečnej slučke.
  const now = new Date().toISOString();
  let query = supabase
    .from("chat_reads")
    .select("id")
    .eq("user_id", userId)
    .eq("scope", scope);
  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data: existing, error: selErr } = await query.maybeSingle();
  if (selErr) {
    console.warn("markChatRead select failed:", selErr.message);
    return;
  }
  if (existing?.id) {
    const { error } = await supabase
      .from("chat_reads")
      .update({ last_read_at: now })
      .eq("id", existing.id);
    if (error) console.warn("markChatRead update failed:", error.message);
  } else {
    const { error } = await supabase.from("chat_reads").insert({
      user_id: userId,
      scope,
      project_id: projectId,
      last_read_at: now,
    });
    // 23505 = unique violation: znamená, že riadok medzitým vznikol — ignoruj.
    if (error && (error as { code?: string }).code !== "23505") {
      console.warn("markChatRead insert failed:", error.message);
    }
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
