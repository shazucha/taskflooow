import { useMemo, useState } from "react";
import { Bug, Lightbulb, CheckCircle2, Clock, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateFeedbackReport,
  useCurrentUserId,
  useDeleteFeedbackReport,
  useFeedbackReports,
  useIsAppAdmin,
  useProfiles,
  useSetFeedbackStatus,
} from "@/lib/queries";
import type { FeedbackKind } from "@/lib/feedbackApi";
import { cn } from "@/lib/utils";
import { FeedbackThread } from "@/components/FeedbackThread";

export default function Feedback() {
  const isAdmin = useIsAppAdmin();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: reports = [], isLoading } = useFeedbackReports();
  const createMut = useCreateFeedbackReport();
  const setStatusMut = useSetFeedbackStatus();
  const deleteMut = useDeleteFeedbackReport();

  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "resolved">("new");

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p] as const)),
    [profiles]
  );

  const visible = useMemo(() => {
    if (filter === "all") return reports;
    return reports.filter((r) => r.status === filter);
  }, [reports, filter]);

  const newCount = reports.filter((r) => r.status === "new").length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast.error("Doplň krátky názov");
      return;
    }
    createMut.mutate(
      { kind, title: t, description: description.trim() || null },
      {
        onSuccess: () => {
          toast.success("Nahlásené, ďakujeme!");
          setTitle("");
          setDescription("");
        },
        onError: (err) => toast.error((err as Error).message),
      }
    );
  }

  return (
    <div className="page-container">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Spätná väzba</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Chyby & vylepšenia
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? `Nahlásenia od tímu (${newCount} nových)`
            : "Nahlás chybu alebo navrhni vylepšenie. Admin to uvidí."}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setKind("bug")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              kind === "bug"
                ? "bg-priority-high text-white shadow-[0_0_12px_hsl(var(--priority-high)/0.4)]"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Bug className="h-3.5 w-3.5" /> Chyba
          </button>
          <button
            type="button"
            onClick={() => setKind("improvement")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              kind === "improvement"
                ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Lightbulb className="h-3.5 w-3.5" /> Vylepšenie
          </button>
        </div>

        <Input
          placeholder="Krátky názov (čo nefunguje / čo navrhuješ)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2"
        />
        <Textarea
          placeholder="Detail – kde sa to deje, ako to reprodukovať, prípadne snímka v chate"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={createMut.isPending}>
            <Send className="mr-1.5 h-4 w-4" />
            {createMut.isPending ? "Odosielam…" : "Odoslať"}
          </Button>
        </div>
      </form>

      <div className="mb-3 flex gap-2">
        {(["new", "all", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "new" ? "Nové" : f === "all" ? "Všetky" : "Vyriešené"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Načítavam…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Žiadne nahlásenia v tomto filtri.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => {
            const author = profileById.get(r.user_id);
            const canDelete = isAdmin || r.user_id === currentUserId;
            const isNew = r.status === "new";
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-2xl border bg-card p-4 shadow-sm transition",
                  isNew
                    ? r.kind === "bug"
                      ? "border-priority-high/40 shadow-[0_0_14px_hsl(var(--priority-high)/0.18)]"
                      : "border-primary/40 shadow-[0_0_14px_hsl(var(--primary)/0.18)]"
                    : "border-border opacity-80"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      r.kind === "bug"
                        ? "bg-priority-high/15 text-priority-high"
                        : "bg-primary/15 text-primary"
                    )}
                  >
                    {r.kind === "bug" ? (
                      <Bug className="h-4 w-4" />
                    ) : (
                      <Lightbulb className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{r.title}</h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          isNew
                            ? "bg-priority-high text-white"
                            : "bg-success/15 text-success"
                        )}
                      >
                        {isNew ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {isNew ? "Nové" : "Vyriešené"}
                      </span>
                    </div>
                    {r.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <UserAvatar profile={author} size="sm" />
                      <span>{author?.full_name?.trim() || author?.email || "Neznámy"}</span>
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleString("sk-SK")}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant={isNew ? "default" : "outline"}
                        onClick={() =>
                          setStatusMut.mutate({
                            id: r.id,
                            status: isNew ? "resolved" : "new",
                          })
                        }
                      >
                        {isNew ? "Označiť vyriešené" : "Otvoriť znova"}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Naozaj zmazať?")) deleteMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
