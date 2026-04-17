import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/lib/supabase";
import {
  deleteChatMessage,
  fetchChatMessages,
  markChatRead,
  sendChatMessage,
  uploadChatImage,
} from "@/lib/chatApi";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import type { ChatMessage, ChatScope } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  scope: ChatScope;
  projectId?: string | null;
  title?: string;
  className?: string;
}

const MAX_IMG_MB = 5;

export function Chat({ scope, projectId = null, title, className }: Props) {
  const qc = useQueryClient();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const queryKey = ["chat", scope, projectId ?? "team"];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchChatMessages(scope, projectId),
    enabled: scope === "team" || !!projectId,
  });

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Realtime subscription
  useEffect(() => {
    if (scope === "project" && !projectId) return;
    const channelName = `chat-${scope}-${projectId ?? "team"}`;
    const filter =
      scope === "team"
        ? "scope=eq.team"
        : `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter },
        () => {
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, projectId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark as read on mount + when messages change
  useEffect(() => {
    if (currentUserId && (scope === "team" || projectId)) {
      markChatRead(currentUserId, scope, projectId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, scope, projectId, messages.length]);

  const profileFor = (id: string) => profiles.find((p) => p.id === id);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    const body = text.trim();
    if (!body && !pendingFile) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (pendingFile) {
        if (pendingFile.size > MAX_IMG_MB * 1024 * 1024) {
          toast.error(`Obrázok je väčší ako ${MAX_IMG_MB} MB`);
          setSending(false);
          return;
        }
        imageUrl = await uploadChatImage(currentUserId, pendingFile);
      }
      await sendChatMessage({
        scope,
        project_id: scope === "project" ? projectId : null,
        author_id: currentUserId,
        body: body || null,
        image_url: imageUrl,
      });
      setText("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodarilo sa odoslať");
    } finally {
      setSending(false);
    }
  };

  const remove = async (msg: ChatMessage) => {
    try {
      await deleteChatMessage(msg.id);
      qc.invalidateQueries({ queryKey });
    } catch {
      toast.error("Nepodarilo sa zmazať");
    }
  };

  return (
    <div className={cn("card-elevated flex flex-col overflow-hidden", className)}>
      {title && (
        <div className="border-b border-border/60 px-4 py-2.5">
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      )}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" style={{ minHeight: 240, maxHeight: 420 }}>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Zatiaľ žiadne správy. Napíš prvú 👋
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === currentUserId;
            const author = profileFor(m.author_id);
            return (
              <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <UserAvatar profile={author} size="sm" />
                <div className={cn("group max-w-[78%] space-y-1", mine && "items-end")}>
                  <div className={cn("flex items-center gap-2 text-[10px] text-muted-foreground", mine && "justify-end")}>
                    <span className="font-semibold">{author?.full_name ?? author?.email ?? "?"}</span>
                    <span>{new Date(m.created_at).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground"
                    )}
                  >
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={m.image_url}
                          alt="Príloha"
                          className="mb-1.5 max-h-56 rounded-lg object-cover"
                          loading="lazy"
                        />
                      </a>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  </div>
                  {mine && (
                    <button
                      onClick={() => remove(m)}
                      className="text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="inline h-3 w-3" /> Zmazať
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingFile && (
        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2 text-xs">
          <ImagePlus className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1 truncate">{pendingFile.name}</span>
          <button
            type="button"
            onClick={() => {
              setPendingFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border/60 bg-card p-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9 shrink-0"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Napíš správu…"
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" disabled={sending || (!text.trim() && !pendingFile)} className="h-9 w-9 shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
