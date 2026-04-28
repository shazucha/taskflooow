import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useTeamPresence } from "@/lib/useTeamPresence";

type PubRow = { schema_name: string; table_name: string; publication: string };
type HeartbeatStatus = "idle" | "connecting" | "subscribed" | "error" | "closed";
type ConnStatus = "idle" | "connecting" | "subscribed" | "error" | "closed";
type PresenceMeta = { lastSeen: number; event: "sync" | "join" | "leave" };

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

  // Realtime connection + per-user activity tracking (separate observer channel)
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [eventCounts, setEventCounts] = useState({ sync: 0, join: 0, leave: 0 });
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [perUser, setPerUser] = useState<Record<string, PresenceMeta>>({});
  const [now, setNow] = useState(Date.now());

  // Tick clock for "x s ago" labels
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  // Observer on the SAME global channel — counts events and records last-seen per user.
  useEffect(() => {
    if (!userId) return;
    setConnStatus("connecting");
    setConnError(null);
    setEventCounts({ sync: 0, join: 0, leave: 0 });
    setPerUser({});

    const channel = supabase.channel("presence-team-global", {
      config: { presence: { key: userId } },
    });

    const stamp = (event: "sync" | "join" | "leave", keys: string[]) => {
      const ts = Date.now();
      setLastEventAt(ts);
      setEventCounts((c) => ({ ...c, [event]: c[event] + 1 }));
      if (keys.length > 0) {
        setPerUser((prev) => {
          const next = { ...prev };
          for (const k of keys) next[k] = { lastSeen: ts, event };
          return next;
        });
      } else if (event === "sync") {
        // sync without keys still updates everyone currently present
        const state = channel.presenceState() as Record<string, unknown[]>;
        setPerUser((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(state)) next[k] = { lastSeen: ts, event: "sync" };
          return next;
        });
      }
    };

    channel
      .on("presence", { event: "sync" }, () => stamp("sync", []))
      .on("presence", { event: "join" }, ({ key }) => stamp("join", [key]))
      .on("presence", { event: "leave" }, ({ key }) => stamp("leave", [key]))
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") setConnStatus("subscribed");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnStatus("error");
          setConnError(err?.message ?? status);
        } else if (status === "CLOSED") setConnStatus("closed");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, tick]);

  const onlineProfiles = useMemo(
    () => profiles.filter((p) => onlineIds.has(p.id)),
    [profiles, onlineIds],
  );

  const meOnline = userId ? onlineIds.has(userId) : false;

  const fmtAgo = (ts: number | null) => {
    if (!ts) return "—";
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const userRows = useMemo(() => {
    return profiles
      .map((p) => ({
        id: p.id,
        label: p.full_name ?? p.email ?? p.id,
        online: onlineIds.has(p.id),
        meta: perUser[p.id] ?? null,
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.label.localeCompare(b.label));
  }, [profiles, onlineIds, perUser]);

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Connection:</span>
            <Badge
              variant={
                connStatus === "subscribed"
                  ? "default"
                  : connStatus === "error"
                  ? "destructive"
                  : "secondary"
              }
            >
              {connStatus}
            </Badge>
            {connError && <span className="text-xs text-destructive">{connError}</span>}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>sync: <strong className="text-foreground">{eventCounts.sync}</strong></span>
            <span>join: <strong className="text-foreground">{eventCounts.join}</strong></span>
            <span>leave: <strong className="text-foreground">{eventCounts.leave}</strong></span>
            <span>posledný event: <strong className="text-foreground">{fmtAgo(lastEventAt)}</strong></span>
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
          <CardTitle className="text-base">Per-user online state</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {userRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Žiadne profily.</p>
          ) : (
            <ul className="divide-y">
              {userRows.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        u.online ? "bg-green-500" : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="truncate">{u.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {u.meta && (
                      <Badge variant="outline" className="text-[10px]">
                        {u.meta.event}
                      </Badge>
                    )}
                    <span>{u.meta ? fmtAgo(u.meta.lastSeen) : "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
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