// Auto-oprava statusov Google-importovaných úloh + rollback.
// Akcie:
//   action: "fix"      -> opraví podľa end-dátumu, vráti snapshot_id pre rollback
//   action: "rollback" -> obnoví statusy z konkrétneho snapshot_id
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
    const body = await req.json().catch(() => ({}));
    const action: "fix" | "rollback" = body?.action === "rollback" ? "rollback" : "fix";

    // -----------------------------
    // ROLLBACK
    // -----------------------------
    if (action === "rollback") {
      const snapshotId: string | undefined = body?.snapshot_id;
      if (!snapshotId) {
        return new Response(JSON.stringify({ error: "snapshot_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: snap, error: snapErr } = await admin
        .from("google_calendar_status_snapshots")
        .select("id, user_id, items")
        .eq("id", snapshotId)
        .maybeSingle();
      if (snapErr) throw snapErr;
      if (!snap || snap.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "snapshot not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const items = (snap.items as Array<{ id: string; status: string }>) ?? [];
      // Skupiny podľa statusu, aby sme spravili max 2 update calls.
      const byStatus = new Map<string, string[]>();
      for (const it of items) {
        if (!byStatus.has(it.status)) byStatus.set(it.status, []);
        byStatus.get(it.status)!.push(it.id);
      }
      let restored = 0;
      for (const [status, ids] of byStatus) {
        if (ids.length === 0) continue;
        const { error } = await admin
          .from("tasks")
          .update({ status })
          .in("id", ids)
          .eq("google_calendar_owner", user.id);
        if (!error) restored += ids.length;
      }

      // Snapshot po použití zmažeme — je jednorazový.
      await admin.from("google_calendar_status_snapshots").delete().eq("id", snapshotId);

      return new Response(
        JSON.stringify({ ok: true, action: "rollback", restored }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -----------------------------
    // FIX
    // -----------------------------
    const { data: rows, error } = await admin
      .from("tasks")
      .select("id, status, due_date, due_end")
      .eq("google_calendar_owner", user.id)
      .eq("google_imported", true);
    if (error) throw error;

    const now = Date.now();
    const toDone: string[] = [];
    const toTodo: string[] = [];
    const snapshotItems: Array<{ id: string; status: string }> = [];

    for (const t of rows ?? []) {
      const endIso = (t as any).due_end ?? (t as any).due_date;
      if (!endIso) continue;
      const endMs = new Date(endIso).getTime();
      const isPast = endMs < now;
      if (isPast && t.status !== "done") {
        toDone.push(t.id);
        snapshotItems.push({ id: t.id, status: t.status });
      } else if (!isPast && t.status === "done") {
        toTodo.push(t.id);
        snapshotItems.push({ id: t.id, status: t.status });
      }
    }

    let snapshotId: string | null = null;
    if (snapshotItems.length > 0) {
      const { data: snap, error: snapErr } = await admin
        .from("google_calendar_status_snapshots")
        .insert({ user_id: user.id, items: snapshotItems })
        .select("id")
        .single();
      if (snapErr) throw snapErr;
      snapshotId = snap.id;
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
        action: "fix",
        scanned: rows?.length ?? 0,
        fixed_to_done: toDone.length,
        fixed_to_todo: toTodo.length,
        snapshot_id: snapshotId,
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