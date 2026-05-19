// Agreguje "Facebook-style" notifikácie: nové DM, tímový chat, projektový chat.
// Načítava unread počty + posledné správy a vystaví zoznam položiek pre zvonček.
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { useCurrentUserId, useProfiles, useProjects, useTasks } from "./queries";
import { fetchChatReads, markChatRead } from "./chatApi";
import { fetchDirectReads, markDirectRead } from "./dmApi";
import { pendingTasksForUser } from "./recurring";

export type NotificationKind = "dm" | "team-chat" | "project-chat" | "tasks-pending";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  preview: string;
  url: string;
  count: number;
  time: string; // ISO
  peerId?: string;
  projectId?: string;
}

interface RawMsg {
  id: string;
  scope?: "team" | "project";
  project_id?: string | null;
  author_id?: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
}

function previewOf(body: string | null, image: string | null): string {
  const t = body?.trim();
  if (t) return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  return image ? "📷 Fotka" : "Nová správa";
}

export function useNotificationsFeed(): {
  items: NotificationItem[];
  total: number;
  refresh: () => void;
  markAllRead: () => Promise<void>;
  markItemRead: (it: NotificationItem) => Promise<void>;
} {
  const userId = useCurrentUserId();
  const { data: profiles = [] } = useProfiles();
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useTasks();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const refreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      // 1) Reads (DM + chat)
      const [chatReads, dmReads] = await Promise.all([
        fetchChatReads(userId),
        fetchDirectReads(userId),
      ]);

      const teamReadAt =
        chatReads.find((r) => r.scope === "team")?.last_read_at ?? "1970-01-01T00:00:00Z";
      const projectReadAt = new Map<string, string>();
      for (const r of chatReads) {
        if (r.scope === "project" && r.project_id) {
          projectReadAt.set(r.project_id, r.last_read_at);
        }
      }
      const dmReadAt = new Map<string, string>();
      for (const r of dmReads) dmReadAt.set(r.peer_id, r.last_read_at);

      // 2) Načítaj posledné správy (paralelne)
      const [teamRes, projRes, dmRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("id, author_id, body, image_url, created_at")
          .eq("scope", "team")
          .neq("author_id", userId)
          .gt("created_at", teamReadAt)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("chat_messages")
          .select("id, project_id, author_id, body, image_url, created_at")
          .eq("scope", "project")
          .neq("author_id", userId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("direct_messages")
          .select("id, sender_id, body, image_url, created_at")
          .eq("recipient_id", userId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const out: NotificationItem[] = [];

      // Team chat — agregovaný do jednej položky
      const teamMsgs = (teamRes.data ?? []) as RawMsg[];
      if (teamMsgs.length > 0) {
        const last = teamMsgs[0];
        const author = profiles.find((p) => p.id === last.author_id);
        const name = author?.full_name?.trim() || author?.email || "Niekto";
        out.push({
          id: "team",
          kind: "team-chat",
          title: "Tímový chat",
          preview: `${name}: ${previewOf(last.body, last.image_url)}`,
          url: "/chat",
          count: teamMsgs.length,
          time: last.created_at,
        });
      }

      // Project chat — groupované per project, len také, kde created_at > last_read
      const projGroups = new Map<string, RawMsg[]>();
      for (const m of (projRes.data ?? []) as RawMsg[]) {
        const pid = m.project_id;
        if (!pid) continue;
        const since = projectReadAt.get(pid) ?? "1970-01-01T00:00:00Z";
        if (m.created_at <= since) continue;
        const arr = projGroups.get(pid) ?? [];
        arr.push(m);
        projGroups.set(pid, arr);
      }
      for (const [pid, msgs] of projGroups) {
        const last = msgs[0];
        const project = projects.find((p) => p.id === pid);
        const author = profiles.find((p) => p.id === last.author_id);
        const name = author?.full_name?.trim() || author?.email || "Niekto";
        out.push({
          id: `project:${pid}`,
          kind: "project-chat",
          title: project?.name ?? "Projekt",
          preview: `${name}: ${previewOf(last.body, last.image_url)}`,
          url: `/projects/${pid}`,
          count: msgs.length,
          time: last.created_at,
          projectId: pid,
        });
      }

      // DM — per peer
      const dmGroups = new Map<string, { id: string; body: string | null; image_url: string | null; created_at: string }[]>();
      for (const m of dmRes.data ?? []) {
        const since = dmReadAt.get(m.sender_id) ?? "1970-01-01T00:00:00Z";
        if (m.created_at <= since) continue;
        const arr = dmGroups.get(m.sender_id) ?? [];
        arr.push(m);
        dmGroups.set(m.sender_id, arr);
      }
      for (const [peerId, msgs] of dmGroups) {
        const last = msgs[0];
        const peer = profiles.find((p) => p.id === peerId);
        const name = peer?.full_name?.trim() || peer?.email || "Niekto";
        out.push({
          id: `dm:${peerId}`,
          kind: "dm",
          title: name,
          preview: previewOf(last.body, last.image_url),
          url: "/chat",
          count: msgs.length,
          time: last.created_at,
          peerId,
        });
      }

      out.sort((a, b) => (a.time < b.time ? 1 : -1));

      // Nedokončené úlohy — jedna agregovaná položka navrchu
      const { all: pendingAll, overdue: pendingOverdue } = pendingTasksForUser(tasks, userId);
      if (pendingAll.length > 0) {
        out.unshift({
          id: "tasks-pending",
          kind: "tasks-pending",
          title: "Nedokončené úlohy",
          preview:
            pendingOverdue.length > 0
              ? `${pendingAll.length} celkom · ${pendingOverdue.length} po termíne`
              : `${pendingAll.length} čaká na dokončenie`,
          url: "/tasks",
          count: pendingAll.length,
          time: new Date().toISOString(),
        });
      }

      setItems(out);
    } catch (e) {
      console.warn("notifications refresh failed", e);
    }
  }, [userId, profiles, projects, tasks]);

  refreshRef.current = refresh;

  useEffect(() => {
    if (!userId) return;
    refreshRef.current();
    const ch = supabase
      .channel(`notif-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => refreshRef.current()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
        () => refreshRef.current()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${userId}` },
        () => refreshRef.current()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_message_reads", filter: `user_id=eq.${userId}` },
        () => refreshRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const markItemRead = useCallback(
    async (it: NotificationItem) => {
      if (!userId) return;
      if (it.kind === "team-chat") await markChatRead(userId, "team", null);
      else if (it.kind === "project-chat" && it.projectId)
        await markChatRead(userId, "project", it.projectId);
      else if (it.kind === "dm" && it.peerId) await markDirectRead(userId, it.peerId);
      await refreshRef.current();
    },
    [userId]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await Promise.all(
      items.map((it) => {
        if (it.kind === "team-chat") return markChatRead(userId, "team", null);
        if (it.kind === "project-chat" && it.projectId)
          return markChatRead(userId, "project", it.projectId);
        if (it.kind === "dm" && it.peerId) return markDirectRead(userId, it.peerId);
        return Promise.resolve();
      })
    );
    await refreshRef.current();
  }, [userId, items]);

  const total = items.reduce((a, b) => a + b.count, 0);
  return { items, total, refresh, markAllRead, markItemRead };
}