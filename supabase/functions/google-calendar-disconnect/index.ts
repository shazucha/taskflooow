// Removes the user's Google tokens. Optionally revokes refresh token at Google.

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
    const { data } = await admin
      .from("google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data?.refresh_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${data.refresh_token}`, {
        method: "POST",
      }).catch(() => {});
    }

    await admin.from("google_calendar_tokens").delete().eq("user_id", user.id);

    // Delete tasks that were imported FROM Google (they have no value without the source).
    await admin
      .from("tasks")
      .delete()
      .eq("google_calendar_owner", user.id)
      .eq("google_imported", true);

    // Clear sync mapping for tasks that originated in TaskFlow but were synced to this user's calendar.
    await admin
      .from("tasks")
      .update({ google_event_id: null, google_calendar_owner: null })
      .eq("google_calendar_owner", user.id)
      .eq("google_imported", false);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});