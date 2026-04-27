import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Mirrors hasTime() in supabase/functions/google-calendar-sync/index.ts.
 * Must stay in sync — this page is for verifying the same logic.
 */
function hasTime(iso: string): boolean {
  if (!iso || !iso.includes("T")) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

function decide(due_date: string, due_end: string) {
  const hasInterval = !!due_date && (!!due_end || hasTime(due_date));
  return {
    hasInterval,
    action: hasInterval ? "UPSERT to Google" : "SKIP / DELETE event",
    reason: !due_date
      ? "no due_date"
      : hasInterval
      ? due_end
        ? "explicit due_end present"
        : "due_date carries non-zero UTC time"
      : "due_date has 00:00:00 UTC and no due_end (treated as all-day)",
  };
}

function describe(iso: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { valid: false, utc: "—", local: "—", utcHMS: "—" };
  return {
    valid: true,
    utc: d.toISOString(),
    local: d.toLocaleString(),
    utcHMS: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`,
  };
}

/** Mobile Safari often emits "YYYY-MM-DDTHH:mm" without seconds/zone. */
function mobileLikeFromLocal(local: string): string {
  // local: "YYYY-MM-DDTHH:mm" from <input type="datetime-local">
  if (!local) return "";
  // Mimic what mobile UI tends to send: append :00 and treat as local then convert to UTC ISO
  const d = new Date(local);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Desktop usually sends a fully-zoned ISO with seconds. */
function desktopLikeFromLocal(local: string): string {
  if (!local) return "";
  const d = new Date(local + ":00");
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

interface ScenarioProps {
  title: string;
  hint: string;
  due_date: string;
  due_end: string;
}

function ScenarioCard({ title, hint, due_date, due_end }: ScenarioProps) {
  const start = describe(due_date);
  const end = describe(due_end);
  const decision = decide(due_date, due_end);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{title}</span>
          <Badge variant={decision.hasInterval ? "default" : "secondary"}>
            {decision.hasInterval ? "SYNC" : "SKIP"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-[110px_1fr] gap-y-1 font-mono text-xs">
          <span className="text-muted-foreground">due_date</span>
          <span className="break-all">{due_date || <em className="text-muted-foreground">empty</em>}</span>
          <span className="text-muted-foreground">  UTC HMS</span>
          <span>{start?.utcHMS ?? "—"}</span>
          <span className="text-muted-foreground">  local</span>
          <span>{start?.local ?? "—"}</span>

          <span className="mt-2 text-muted-foreground">due_end</span>
          <span className="mt-2 break-all">{due_end || <em className="text-muted-foreground">empty</em>}</span>
          <span className="text-muted-foreground">  UTC HMS</span>
          <span>{end?.utcHMS ?? "—"}</span>
          <span className="text-muted-foreground">  local</span>
          <span>{end?.local ?? "—"}</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sync decision
          </p>
          <p className="mt-1 text-sm font-medium">{decision.action}</p>
          <p className="text-xs text-muted-foreground">hasInterval = {String(decision.hasInterval)} — {decision.reason}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoogleSyncDiag() {
  const [localStart, setLocalStart] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [localEnd, setLocalEnd] = useState<string>("");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const desktopStart = useMemo(() => desktopLikeFromLocal(localStart), [localStart]);
  const desktopEnd = useMemo(() => desktopLikeFromLocal(localEnd), [localEnd]);
  const mobileStart = useMemo(() => mobileLikeFromLocal(localStart), [localStart]);
  const mobileEnd = useMemo(() => mobileLikeFromLocal(localEnd), [localEnd]);

  const allDayStart = useMemo(() => {
    if (!localStart) return "";
    const d = new Date(localStart);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }, [localStart]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:pl-72 md:pr-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Google sync — diagnostika</h1>
        <p className="text-sm text-muted-foreground">
          Stránka zrkadlí logiku <code className="font-mono text-xs">hasTime()</code> a{" "}
          <code className="font-mono text-xs">hasInterval</code> z edge funkcie{" "}
          <code className="font-mono text-xs">google-calendar-sync</code>. Ukáže, či by sa úloha s
          danými hodnotami synchronizovala do Google Calendar — pre desktop a mobil rovnako.
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Vstup — simuluj formulár úlohy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Nastav lokálny čas; nižšie uvidíš, ako rovnaký vstup vyzerá z desktopu a z mobilu.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="diag-start">Začiatok (lokálny)</Label>
            <Input
              id="diag-start"
              type="datetime-local"
              value={localStart}
              onChange={(e) => setLocalStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diag-end">Koniec (lokálny, voliteľné)</Label>
            <Input
              id="diag-end"
              type="datetime-local"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ScenarioCard
          title="Desktop"
          hint="ISO so sekundami, štandardný Date → toISOString()."
          due_date={desktopStart}
          due_end={desktopEnd}
        />
        <ScenarioCard
          title="Mobil"
          hint="ISO bez sekúnd v lokálnom vstupe, prevedené na UTC."
          due_date={mobileStart}
          due_end={mobileEnd}
        />
        <ScenarioCard
          title="All-day (00:00 UTC, bez due_end)"
          hint="Reprodukuje pôvodný bug — predtým sa neposielalo, teraz správne SKIP."
          due_date={allDayStart}
          due_end=""
        />
        <ScenarioCard
          title="All-day s due_end"
          hint="00:00 UTC ale s explicitným koncom → SYNC."
          due_date={allDayStart}
          due_end={desktopEnd || allDayStart}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Vlastný ISO vstup</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sem prilep skutočný <code className="font-mono">due_date</code> /{" "}
            <code className="font-mono">due_end</code> z DB pre konkrétnu úlohu.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="diag-custom-start">due_date (ISO)</Label>
              <Input
                id="diag-custom-start"
                placeholder="2026-04-27T13:30:00.000Z"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diag-custom-end">due_end (ISO)</Label>
              <Input
                id="diag-custom-end"
                placeholder="prázdne alebo 2026-04-27T14:00:00.000Z"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
          <ScenarioCard
            title="Custom vstup"
            hint="Presne to, čo by edge funkcia dostala z DB."
            due_date={customStart}
            due_end={customEnd}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomStart("");
              setCustomEnd("");
            }}
          >
            Vyčistiť
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}