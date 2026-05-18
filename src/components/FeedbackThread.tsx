import { useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import {
  useCreateFeedbackComment,
  useCurrentUserId,
  useDeleteFeedbackComment,
  useFeedbackComments,
  useIsAppAdmin,
  useProfiles,
} from "@/lib/queries";

export function FeedbackThread({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const isAdmin = useIsAppAdmin();
  const { data: comments = [], isLoading } = useFeedbackComments(open ? reportId : undefined);
  const createMut = useCreateFeedbackComment(reportId);
  const deleteMut = useDeleteFeedbackComment(reportId);

  const profileById = new Map(profiles.map((p) => [p.id, p] as const));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = body.trim();
    if (!v) return;
    if (v.length > 2000) {
      toast.error("Komentár je príliš dlhý (max 2000)");
      return;
    }
    createMut.mutate(v, {
      onSuccess: () => setBody(""),
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {open ? "Skryť komentáre" : "Komentáre"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Načítavam…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Zatiaľ žiadny komentár.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => {
                const author = profileById.get(c.user_id);
                const canDelete = isAdmin || c.user_id === currentUserId;
                return (
                  <li
                    key={c.id}
                    className="flex items-start gap-2 rounded-xl bg-surface-muted/60 p-2.5"
                  >
                    <UserAvatar profile={author} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {author?.full_name?.trim() || author?.email || "Neznámy"}
                        </span>
                        <span>·</span>
                        <span>{new Date(c.created_at).toLocaleString("sk-SK")}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                        {c.body}
                      </p>
                    </div>
                    {canDelete && (
                      <button
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
              placeholder="Pridaj komentár alebo doplň kontext…"
              rows={2}
              maxLength={2000}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={createMut.isPending || !body.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
