import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import {
  useCreateMonthlyWorkComment,
  useCurrentUserId,
  useDeleteMonthlyWorkComment,
  useIsAppAdmin,
  useProfiles,
} from "@/lib/queries";
import type { MonthlyWorkComment } from "@/lib/monthlyWorkCommentsApi";

interface Props {
  projectId: string;
  monthKey: string;
  workId: string;
  comments: MonthlyWorkComment[];
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "teraz";
  const min = Math.round(sec / 60);
  if (min < 60) return `pred ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `pred ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `pred ${day} d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `pred ${wk} týž.`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `pred ${mo} mes.`;
  const yr = Math.round(day / 365);
  return `pred ${yr} r.`;
}

/**
 * Vlákno komentárov k jednej položke náplne predplatného (per mesiac).
 * Zobrazuje sa inline pod riadkom v MonthlyDeliverablesCard.
 */
export function MonthlyWorkCommentsPanel({ projectId, monthKey, workId, comments, onClose }: Props) {
  const [body, setBody] = useState("");
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const isAdmin = useIsAppAdmin();
  const createMut = useCreateMonthlyWorkComment(projectId, monthKey);
  const deleteMut = useDeleteMonthlyWorkComment(projectId, monthKey);

  const profileById = new Map(profiles.map((p) => [p.id, p] as const));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = body.trim();
    if (!v) return;
    if (v.length > 2000) {
      toast.error("Komentár je príliš dlhý (max 2000)");
      return;
    }
    createMut.mutate(
      { work_id: workId, body: v },
      {
        onSuccess: () => setBody(""),
        onError: (err) => toast.error((err as Error).message),
      }
    );
  };

  return (
    <li className="ml-6 rounded-xl border border-primary/30 bg-primary-soft/30 p-3">
      <div className="space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Zatiaľ žiadny komentár — buď prvý.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => {
              const author = profileById.get(c.user_id);
              const canDelete = isAdmin || c.user_id === currentUserId;
              return (
                <li key={c.id} className="flex items-start gap-2 rounded-lg bg-card/70 p-2">
                  <UserAvatar profile={author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {author?.full_name?.trim() || author?.email || "Neznámy"}
                      </span>
                      <span>·</span>
                      <span title={new Date(c.created_at).toLocaleString("sk-SK")}>
                        {relativeTime(c.created_at)}
                      </span>
                      <span className="text-muted-foreground/60">
                        ({new Date(c.created_at).toLocaleString("sk-SK", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })})
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Zmazať komentár?")) deleteMut.mutate(c.id);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Zmazať"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={submit} className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Doplň upresnenie alebo otázku k tejto náplni…"
            rows={2}
            maxLength={2000}
            className="flex-1 text-sm"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <Button type="submit" size="sm" disabled={createMut.isPending || !body.trim()}>
              <Send className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Zavrieť
            </Button>
          </div>
        </form>
      </div>
    </li>
  );
}
