import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useTeamPresence } from "@/lib/useTeamPresence";

type PubRow = { schema_name: string; table_name: string; publication: string };
type HeartbeatStatus = "idle" | "connecting" | "subscribed" | "error" | "closed";

/**
 * Diagnostics page for the presence / online-status feature.
 *
 * Verifies three things:
 *  1. Realtime publication contains the chat-related tables (via SQL view
 *     `public.presence_debug`). Presence itself is in-memory in Supabase
 *     Realtime, so there is no presence table to inspect.
 *  2. Our shared global presence channel `presence-team-global` connects and
 *     reports the current user as a member.
 *  3. A standalone heartbeat channel can SUBSCRIBE end-to-end (sanity check
 *     that realtime websocket + auth token are healthy for this client).
 */
export default function PresenceDiag() {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const onlineIds = useTeamPresence();

  const [pubRows, setPubRows] = useState<PubRow[] | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus>("idle");
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Load presence_debug view
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("presence_debug" as never)
        .select("schema_name,table_name,publication");
      if (cancelled) return;
      if (error) {
        setPubError(error.message);
        setPubRows([]);
      } else {
        setPubRows((data as unknown as PubRow[]) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Standalone heartbeat channel
  useEffect(() => {
    if (!userId) return;
    setHeartbeat("connecting");
    setHeartbeatError(null);
    const channel = supabase.channel(`presence-diag-heartbeat-${userId}-${Date.now()}`, {
      config: { presence: { key: userId } },
    });
    channel.subscribe(async (status, err) => {
      if (status === "SUBSCRIBED") {
        setHeartbeat("subscribed");
        await channel.track({ user_id: userId, at: Date.now() }).catch(() => {});
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setHeartbeat("error");
        setHeartbeatError(err?.message ?? status);
      } else if (status === "CLOSED") {
        setHeartbeat("closed");
      }
    });
    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    };
  }, [userId, tick]);

  const onlineProfiles = useMemo(
    () => profiles.filter((p) => onlineIds.has(p.id)),
    [profiles, onlineIds],
  );

  const meOnline = userId ? onlineIds.has(userId) : false;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Presence diagnostika</h1>
          <p className="text-sm text-muted-foreground">
            Overuje, či heartbeat / presence kanál a realtime publikácie fungujú.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)}>
          Obnoviť
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Globálny presence kanál</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Kanál:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">presence-team-global</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Som online:</span>
            <Badge variant={meOnline ? "default" : "destructive"}>
              {meOnline ? "ÁNO" : "NIE"}
            </Badge>
            {userId && <code className="text-xs text-muted-foreground">{userId}</code>}
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">
              Online členovia ({onlineProfiles.length}):
            </p>
            {onlineProfiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nikto.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {onlineProfiles.map((p) => (
                  <li key={p.id}>
                    <Badge variant="secondary">{p.full_name ?? p.email ?? p.id}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Heartbeat (samostatný kanál)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <Badge
              variant={
                heartbeat === "subscribed"
                  ? "default"
                  : heartbeat === "error"
                  ? "destructive"
                  : "secondary"
              }
            >
              {heartbeat}
            </Badge>
          </div>
          {heartbeatError && (
            <p className="text-xs text-destructive">{heartbeatError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Ak status zostane „connecting" alebo skončí ako „error", websocket /
            auth token nie je v poriadku — presence nebude fungovať.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            3. Realtime publikácia (view <code>public.presence_debug</code>)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {pubError && (
            <p className="text-xs text-destructive">
              {pubError} — spustil si migráciu{" "}
              <code>20260428160000_presence_debug_view.sql</code>?
            </p>
          )}
          {pubRows && pubRows.length === 0 && !pubError && (
            <p className="text-xs text-muted-foreground">
              Žiadne tabuľky v <code>supabase_realtime</code> publikácii.
            </p>
          )}
          {pubRows && pubRows.length > 0 && (
            <ul className="grid grid-cols-2 gap-1 text-xs md:grid-cols-3">
              {pubRows.map((r) => (
                <li key={`${r.schema_name}.${r.table_name}`}>
                  <code>
                    {r.schema_name}.{r.table_name}
                  </code>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Poznámka: Supabase presence beží v pamäti realtime servera — žiadna
            DB tabuľka ho nezálohuje. Tento výpis len potvrdzuje, že realtime
            publikácia existuje a obsahuje chat tabuľky.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}