import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, ImagePlus, Loader2, Send, Trash2, X } from "lucide-react";
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
import type { ChatMessage, ChatScope, Profile } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  scope: ChatScope;
  projectId?: string | null;
  title?: string;
  className?: string;
  /** "chat" (default) shows time only; "notes" shows full date + time and uses note-style copy. */
  variant?: "chat" | "notes";
}

const MAX_IMG_MB = 5;

export function Chat({ scope, projectId = null, title, className, variant = "chat" }: Props) {
  const isNotes = variant === "notes";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const presenceKey = `presence-${scope}-${projectId ?? "team"}`;

  // Realtime presence — kto je práve online v tomto chate
  useEffect(() => {
    if (!currentUserId) return;
    if (scope === "project" && !projectId) return;
    const channel = supabase.channel(presenceKey, {
      config: { presence: { key: currentUserId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: currentUserId, at: Date.now() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, scope, projectId]);

  const onlineProfiles = useMemo(
    () => profiles.filter((p) => onlineIds.has(p.id)),
    [profiles, onlineIds]
  );

  // Kandidáti pre @mention dropdown
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return profiles
      .filter((p) => p.id !== currentUserId)
      .filter((p) => {
        if (!q) return true;
        const name = (p.full_name ?? p.email ?? "").toLowerCase();
        return name.includes(q);
      })
      .slice(0, 6);
  }, [profiles, mentionQuery, currentUserId]);

  const handleTextChange = (value: string) => {
    setText(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    setMentionQuery(match ? match[1] : null);
  };

  const insertMention = (p: Profile) => {
    const name = (p.full_name ?? p.email ?? "user").replace(/\s+/g, " ").trim();
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/(?:^|\s)@([\p{L}0-9._-]*)$/u, (m) =>
      m.startsWith(" ") ? " " : ""
    );
    const after = text.slice(caret);
    const insert = `@${name} `;
    const next = `${before}${insert}${after}`;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length + insert.length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const renderBody = (body: string) => {
    const names = profiles
      .map((p) => (p.full_name ?? p.email ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0) return body;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(${escaped.join("|")})`, "g");
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m.index > last) parts.push(body.slice(last, m.index));
      parts.push(
        <span
          key={`${m.index}-${m[1]}`}
          className="rounded bg-primary/15 px-1 font-semibold text-primary"
        >
          @{m[1]}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (last < body.length) parts.push(body.slice(last));
    return parts;
  };

  const myName = useMemo(() => {
    const me = profiles.find((p) => p.id === currentUserId);
    return (me?.full_name ?? me?.email ?? "").trim();
  }, [profiles, currentUserId]);

  const isMentioningMe = (body: string | null) => {
    if (!body || !myName) return false;
    return new RegExp(`@${myName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(body);
  };

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

      {/* Online používatelia */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Online
        </span>
        {onlineProfiles.length === 0 ? (
          <span className="text-xs text-muted-foreground">Nikto iný práve nie je v chate</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {onlineProfiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.id !== currentUserId && insertMention(p)}
                className="group flex items-center gap-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] transition hover:bg-primary/10"
                title={p.id === currentUserId ? "To si ty" : `Spomenúť @${p.full_name ?? p.email}`}
              >
                <span className="relative">
                  <UserAvatar profile={p} size="sm" />
                  <span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full border border-card bg-success" />
                </span>
                <span className="font-medium">{p.full_name ?? p.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" style={{ minHeight: 240, maxHeight: 420 }}>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {isNotes ? "Zatiaľ žiadne poznámky. Pridaj prvú ✍️" : "Zatiaľ žiadne správy. Napíš prvú 👋"}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === currentUserId;
            const author = profileFor(m.author_id);
            const mentionsMe = !mine && isMentioningMe(m.body);
            return (
              <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <UserAvatar profile={author} size="sm" />
                <div className={cn("group max-w-[78%] space-y-1", mine && "items-end")}>
                  <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground", mine && "justify-end")}>
                    <span className="font-semibold text-foreground">{author?.full_name ?? author?.email ?? "?"}</span>
                    <span>
                      {isNotes
                        ? new Date(m.created_at).toLocaleString("sk-SK", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : new Date(m.created_at).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {mentionsMe && (
                      <span className="rounded bg-primary/15 px-1 font-semibold text-primary">
                        spomenul ťa
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      mine
                        ? "bg-primary text-primary-foreground"
                        : mentionsMe
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "bg-surface-muted text-foreground"
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
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">{renderBody(m.body)}</p>
                    )}
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

      <form onSubmit={send} className="relative flex items-center gap-2 border-t border-border/60 bg-card p-2.5">
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-lg">
            {mentionCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(p);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
              >
                <UserAvatar profile={p} size="sm" />
                <span className="flex-1 truncate">{p.full_name ?? p.email}</span>
                {onlineIds.has(p.id) && (
                  <span className="h-2 w-2 rounded-full bg-success" title="Online" />
                )}
              </button>
            ))}
          </div>
        )}
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            const next = `${text}${text.endsWith(" ") || text.length === 0 ? "" : " "}@`;
            setText(next);
            setMentionQuery("");
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              const pos = next.length;
              inputRef.current?.setSelectionRange(pos, pos);
            });
          }}
          className="h-9 w-9 shrink-0"
          title="Spomenúť používateľa"
        >
          <AtSign className="h-4 w-4" />
        </Button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mentionQuery !== null) {
              e.preventDefault();
              setMentionQuery(null);
            }
          }}
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
