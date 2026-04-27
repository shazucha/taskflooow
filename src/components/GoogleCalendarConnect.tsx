import { useEffect, useState } from "react";
import { Calendar, ClipboardCheck, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disconnectGoogle,
  isGoogleConnected,
  pullGoogleEvents,
  startGoogleOAuth,
  type PullResult,
} from "@/lib/googleCalendar";
import { toast } from "sonner";

export function GoogleCalendarConnect() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<PullResult | null>(null);

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

  const runAudit = async () => {
    setAuditing(true);
    setAudit(null);
    try {
      const r = await pullGoogleEvents();
      if (!r) {
        toast.error("Sync zlyhal");
        return;
      }
      setAudit(r);
      toast.success(`Sync hotový: +${r.imported}, ✎${r.updated}, ✕${r.deleted}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setAuditing(false);
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
            <div className="flex flex-col items-end gap-1.5">
              <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Odpojiť
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={runAudit}
                disabled={auditing}
                className="h-7 gap-1.5 px-2 text-xs"
              >
                {auditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                Sync + audit
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={connect} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pripojiť"}
            </Button>
          )
        )}
      </div>

      {audit && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3 text-xs">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><strong>Importované:</strong> {audit.imported}</span>
            <span>todo: {audit.imported_breakdown?.todo ?? 0}</span>
            <span>done: {audit.imported_breakdown?.done ?? 0}</span>
            <span>· upravené: {audit.updated}</span>
            <span>· zmazané: {audit.deleted}</span>
          </div>

          {audit.audit && (
            <div className="border-t border-border/60 pt-2">
              <p className="font-semibold text-foreground">
                Konzistencia ({audit.audit.total_google_tasks} Google úloh):
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>✅ todo & v budúcnosti: <strong>{audit.audit.todo_future_ok}</strong></li>
                <li>✅ done & v minulosti: <strong>{audit.audit.done_past_ok}</strong></li>
                <li className={audit.audit.todo_past_inconsistent > 0 ? "text-destructive" : ""}>
                  ⚠️ todo, ale už skončilo: <strong>{audit.audit.todo_past_inconsistent}</strong>
                </li>
                <li className={audit.audit.done_future_inconsistent > 0 ? "text-warning" : ""}>
                  ⚠️ done, ale ešte len bude: <strong>{audit.audit.done_future_inconsistent}</strong>
                </li>
              </ul>
            </div>
          )}

          {audit.sample && audit.sample.length > 0 && (
            <div className="border-t border-border/60 pt-2">
              <p className="font-semibold text-foreground">Vzorka novo importovaných:</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {audit.sample.map((s, i) => (
                  <li key={i} className="truncate">
                    <span className={s.status === "done" ? "text-success" : "text-primary"}>
                      [{s.status}]
                    </span>{" "}
                    {s.title} <span className="opacity-60">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}