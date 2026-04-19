import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

function isInvalidRefreshTokenError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "refresh_token_not_found";
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (isInvalidRefreshTokenError(error)) {
        await supabase.auth.signOut({ scope: "local" });
        if (!mounted) return;
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

