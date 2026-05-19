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
  // Push do tímového / projektového chatu — všetkým ostatným členom.
  // Fire-and-forget, aby odoslanie nikdy nezadrhlo UI keď RLS/sieť spomalí
  // pomocné selecty (profiles, project_members…).
  void (async () => {
    try {
    const { data: author } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.author_id)
      .maybeSingle();
    let fallbackEmail: string | null = null;
    if (!author?.full_name?.trim() && !author?.email) {
      const { data: auth } = await supabase.auth.getUser();
      fallbackEmail = auth.user?.email ?? null;
    }
    const name = author?.full_name?.trim() || author?.email || fallbackEmail || "Niekto";
    const preview = input.body?.trim() || (input.image_url ? "📷 Fotka" : "Nová správa");

    if (input.scope === "team") {
      const { data: others } = await supabase
        .from("profiles")
        .select("id")
        .neq("id", input.author_id);
      const ids = (others ?? []).map((p) => p.id as string);
      void notifyUsers({
        user_ids: ids,
        title: `${name} v tímovom chate`,
        body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
        url: "/chat",
        tag: "team-chat",
      });
    } else if (input.scope === "project" && input.project_id) {
      // Notifikuj členov projektu (okrem autora). Vlastníka zahŕňame cez projects.owner_id.
      const [{ data: members }, { data: project }] = await Promise.all([
        supabase
          .from("project_members")
          .select("user_id")
          .eq("project_id", input.project_id),
        supabase
          .from("projects")
          .select("owner_id, name")
          .eq("id", input.project_id)
          .maybeSingle(),
      ]);
      const ids = new Set<string>();
      for (const m of members ?? []) if (m.user_id) ids.add(m.user_id as string);
      if (project?.owner_id) ids.add(project.owner_id as string);
      ids.delete(input.author_id);
      void notifyUsers({
        user_ids: Array.from(ids),
        title: `${name} v projekte${project?.name ? ` ${project.name}` : ""}`,
        body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
        url: `/projects/${input.project_id}`,
        tag: `project-chat-${input.project_id}`,
      });
    }
    } catch (e) {
      console.warn("chat notify failed", e);
    }
  })();
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
