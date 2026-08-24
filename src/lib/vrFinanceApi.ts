// VR Liptov — financie: úhrady spoločníkov + mesačné výdaje/príjmy.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";

export interface VrPartnerContribution {
  id: string;
  partner_id: string;
  paid_on: string;
  amount: number;
  purpose: string;
  category: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type VrFinanceDirection = "expense" | "income";

export interface VrFinanceRecord {
  id: string;
  month_key: string;
  occurred_on: string;
  direction: VrFinanceDirection;
  amount: number;
  title: string;
  category: string;
  recurring: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// Kategórie – spoločné pre obe sekcie (jednoduchý, čitateľný prehľad).
export const VR_COST_CATEGORIES: { id: string; label: string }[] = [
  { id: "prevadzka", label: "Prevádzka" },
  { id: "najom", label: "Nájom a energie" },
  { id: "technika", label: "Technika a VR" },
  { id: "software", label: "Softvér a licencie" },
  { id: "marketing", label: "Marketing" },
  { id: "uctovnictvo", label: "Účtovníctvo a odvody" },
  { id: "ine", label: "Iné" },
];

export function vrCategoryLabel(id: string) {
  return VR_COST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function eur(n: number) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n || 0);
}

const PC_COLS = "id,partner_id,paid_on,amount,purpose,category,note,created_by,created_at";
const FR_COLS =
  "id,month_key,occurred_on,direction,amount,title,category,recurring,note,created_by,created_at";

function useRealtime(table: string, key: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () =>
        qc.invalidateQueries({ queryKey: [key] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, table, key]);
}

/* ---------------------------- Spoločníci ---------------------------- */

export function useVrContributions() {
  const userId = useCurrentUserId();
  useRealtime("vr_partner_contributions", "vr_partner_contributions");
  return useQuery({
    queryKey: ["vr_partner_contributions"],
    enabled: !!userId,
    queryFn: async (): Promise<VrPartnerContribution[]> => {
      const { data, error } = await supabase
        .from("vr_partner_contributions")
        .select(PC_COLS)
        .order("paid_on", { ascending: false });
      if (error) {
        console.warn("VR financie: vr_partner_contributions nedostupné", error.message);
        return [];
      }
      return (data ?? []) as VrPartnerContribution[];
    },
  });
}

export function useCreateVrContribution() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: async (input: Omit<VrPartnerContribution, "id" | "created_at" | "created_by">) => {
      const { error } = await supabase
        .from("vr_partner_contributions")
        .insert({ ...input, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_partner_contributions"] }),
  });
}

export function useDeleteVrContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vr_partner_contributions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_partner_contributions"] }),
  });
}

/* ------------------------ Výdaje a príjmy --------------------------- */

export function useVrFinanceRecords(monthKey: string) {
  const userId = useCurrentUserId();
  useRealtime("vr_finance_records", "vr_finance_records");
  return useQuery({
    queryKey: ["vr_finance_records", monthKey],
    enabled: !!userId,
    queryFn: async (): Promise<VrFinanceRecord[]> => {
      const { data, error } = await supabase
        .from("vr_finance_records")
        .select(FR_COLS)
        .eq("month_key", monthKey)
        .order("occurred_on", { ascending: false });
      if (error) {
        console.warn("VR financie: vr_finance_records nedostupné", error.message);
        return [];
      }
      return (data ?? []) as VrFinanceRecord[];
    },
  });
}

export function useCreateVrFinanceRecord() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: async (input: Omit<VrFinanceRecord, "id" | "created_at" | "created_by">) => {
      const { error } = await supabase
        .from("vr_finance_records")
        .insert({ ...input, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_finance_records"] }),
  });
}

export function useDeleteVrFinanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vr_finance_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_finance_records"] }),
  });
}
