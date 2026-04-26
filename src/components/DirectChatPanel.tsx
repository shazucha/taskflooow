import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/lib/supabase";
import {
  conversationKey,
  deleteDirectMessage,
  fetchDirectMessages,
  markDirectRead,
  sendDirectMessage,
} from "@/lib/dmApi";
import { useCurrentUserId, useProfiles } from "@/lib/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectMessage, Profile } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  peer: Profile;
  isOnline: boolean;
  onClose: () => void;
}

export function DirectChatPanel({ peer, isOnline, onClose }: Props) {
  const qc = useQueryClient();
  const currentUserId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const queryKey = useMemo(
    () => ["direct-messages", currentUserId && peer.id ? conversationKey(currentUserId, peer.id) : null],
    [currentUserId, peer.id]
  );

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchDirectMessages(currentUserId!, peer.id),
    enabled: !!currentUserId && !!peer.id,
  });

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea so the user vidí celý napísaný text
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Realtime subscription scoped to this conversation key.
  useEffect(() => {
    if (!currentUserId) return;
    const key = conversationKey(currentUserId, peer.id);
    const channel = supabase
      .channel(`dm-${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_key=eq.${key}`,
        },
        () => qc.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, peer.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  // Mark conversation as read on open + new messages
  useEffect(() => {
    if (currentUserId && peer.id) {
      markDirectRead(currentUserId, peer.id).catch(() => {});
    }
  }, [currentUserId, peer.id, messages.length]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, [peer.id]);

  const profileFor = (id: string) => profiles.find((p) => p.id === id);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendDirectMessage({
        sender_id: currentUserId,
        recipient_id: peer.id,
        body,
        image_url: null,
      });
      setText("");
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodarilo sa odoslať");
    } finally {
      setSending(false);
    }
  };

  const remove = async (msg: DirectMessage) => {
    try {
      await deleteDirectMessage(msg.id);
      qc.invalidateQueries({ queryKey });
    } catch {
      toast.error("Nepodarilo sa zmazať");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="relative">
          <UserAvatar profile={peer} size="md" />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
              isOnline ? "bg-success" : "bg-muted-foreground/40"
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer.full_name ?? peer.email}</p>
          <p className="text-[11px] text-muted-foreground">{isOnline ? "Online" : "Offline"}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
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
            const mine = m.sender_id === currentUserId;
            const author = profileFor(m.sender_id);
            return (
              <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <UserAvatar profile={author} size="sm" />
                <div className={cn("group max-w-[78%] space-y-1", mine && "items-end")}>
                  <div
                    className={cn(
                      "flex items-center gap-2 text-[10px] text-muted-foreground",
                      mine && "justify-end"
                    )}
                  >
                    <span>
                      {new Date(m.created_at).toLocaleString("sk-SK", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      mine ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground"
                    )}
                  >
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

      {/* Composer */}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-border/60 bg-card p-2.5">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !sending) send(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          placeholder={`Napíš ${peer.full_name?.split(" ")[0] ?? "používateľovi"}…`}
          className="block w-full min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ minHeight: 40, maxHeight: 200, boxSizing: "border-box" }}
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} className="h-9 w-9 shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}