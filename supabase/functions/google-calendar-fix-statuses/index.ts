// Auto-oprava statusov Google-importovaných úloh.
// - úloha s end < now() a status != 'done' -> 'done'
// - úloha s end >= now() a status = 'done'  -> 'todo'
// Iba pre úlohy aktuálneho prihláseného user-a (google_calendar_owner = user.id).

import { corsHeaders } from "../_shared/cors.ts";
import { adminClient, getUserFromAuthHeader } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = adminClient();

    const { data: rows, error } = await admin
      .from("tasks")
      .select("id, status, due_date, due_end")
      .eq("google_calendar_owner", user.id)
      .eq("google_imported", true);
    if (error) throw error;

    const now = Date.now();
    const toDone: string[] = [];
    const toTodo: string[] = [];

    for (const t of rows ?? []) {
      const endIso = (t as any).due_end ?? (t as any).due_date;
      if (!endIso) continue;
      const endMs = new Date(endIso).getTime();
      const isPast = endMs < now;
      if (isPast && t.status !== "done") toDone.push(t.id);
      else if (!isPast && t.status === "done") toTodo.push(t.id);
    }

    if (toDone.length > 0) {
      await admin.from("tasks").update({ status: "done" }).in("id", toDone);
    }
    if (toTodo.length > 0) {
      await admin.from("tasks").update({ status: "todo" }).in("id", toTodo);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: rows?.length ?? 0,
        fixed_to_done: toDone.length,
        fixed_to_todo: toTodo.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});