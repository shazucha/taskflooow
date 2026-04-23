import { corsHeaders } from "../_shared/cors.ts";
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, getUserFromAuthHeader } from "../_shared/google.ts";

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

    const body = await req.json().catch(() => ({}));
    const redirectUri: string = body.redirect_uri;
    if (!redirectUri || typeof redirectUri !== "string") {
      return new Response(JSON.stringify({ error: "redirect_uri required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // state = userId (signed not strictly needed because callback re-validates user)
    const state = btoa(JSON.stringify({ uid: user.id, ts: Date.now() }));

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);

    return new Response(JSON.stringify({ url: url.toString() }), {
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