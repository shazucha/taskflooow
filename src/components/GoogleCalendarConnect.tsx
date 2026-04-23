import { useEffect, useState } from "react";
import { Calendar, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectGoogle, isGoogleConnected, startGoogleOAuth } from "@/lib/googleCalendar";
import { toast } from "sonner";

export function GoogleCalendarConnect() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const r = await isGoogleConnected();
    setConnected(r.connected);
    setEmail(r.email);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const url = await startGoogleOAuth();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogle();
      toast.success("Google kalendár odpojený");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-elevated mt-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Google kalendár</p>
          {loading ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Načítavam…</p>
          ) : connected ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Pripojený{email ? `: ${email}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sync úloh s časom do tvojho Google kalendára.
            </p>
          )}
        </div>
        {!loading && (
          connected ? (
            <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Odpojiť
            </Button>
          ) : (
            <Button size="sm" onClick={connect} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pripojiť"}
            </Button>
          )
        )}
      </div>
    </section>
  );
}