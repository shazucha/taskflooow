// VR Liptov — dochádzka a rezervácie VR herne.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";

export type VrEntryKind = "work" | "session" | "reservation";

export interface VrEntry {
  id: string;
  user_id: string;
  day: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;
  kind: VrEntryKind;
  note: string | null;
  created_at: string;
}

export const VR_KIND_META: Record<VrEntryKind, { label: string; badge: string; dot: string }> = {
  work: { label: "Práca (kancelária)", badge: "bg-primary-soft text-primary", dot: "bg-primary" },
  session: { label: "VR session (zákazníci)", badge: "bg-priority-high-soft text-priority-high", dot: "bg-priority-high" },
  reservation: { label: "Rezervácia herne", badge: "bg-priority-medium-soft text-priority-medium", dot: "bg-priority-medium" },
};

const COLS = "id,user_id,day,start_time,end_time,kind,note,created_at";

export async function fetchVrEntries(from: string, to: string): Promise<VrEntry[]> {
  const { data, error } = await supabase
    .from("vr_liptov_entries")
    .select(COLS)
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    console.warn("VR Liptov: tabuľka vr_liptov_entries nie je dostupná?", error.message);
    return [];
  }
  return (data ?? []) as VrEntry[];
}

export function useVrEntries(from: string, to: string) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`vr-liptov-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vr_liptov_entries" }, () =>
        qc.invalidateQueries({ queryKey: ["vr_liptov_entries"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return useQuery({
    queryKey: ["vr_liptov_entries", from, to],
    queryFn: () => fetchVrEntries(from, to),
    enabled: !!userId,
  });
}

export function useCreateVrEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<VrEntry, "id" | "created_at">) => {
      const { data, error } = await supabase.from("vr_liptov_entries").insert(input).select(COLS).single();
      if (error) throw error;
      return data as VrEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_liptov_entries"] }),
  });
}

export function useUpdateVrEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<VrEntry> & { id: string }) => {
      const { error } = await supabase.from("vr_liptov_entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_liptov_entries"] }),
  });
}

export function useDeleteVrEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vr_liptov_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_liptov_entries"] }),
  });
}
