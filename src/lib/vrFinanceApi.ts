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
  group_id: string | null;
  share_mode: VrShareMode;
  total_amount: number | null;
  items: VrContribItem[] | null;
  created_by: string | null;
  created_at: string;
}

export interface VrContribItem {
  name: string;
  price: number;
}

export type VrShareMode = "single" | "half" | "each";

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

// Presné rozdelenie sumy na N častí bez straty centov.
export function splitEven(total: number, parts: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const rest = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

// Zrozumiteľná hláška pri duplicite.
function dupMsg(error: { code?: string; message: string }) {
  return error.code === "23505" ? "Taký záznam už existuje (rovnaký dátum, suma a názov)." : error.message;
}

const PC_COLS =
  "id,partner_id,paid_on,amount,purpose,category,note,group_id,share_mode,total_amount,items,created_by,created_at";
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
      if (error) throw new Error(dupMsg(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_partner_contributions"] }),
  });
}

export function useUpdateVrContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<VrPartnerContribution> }) => {
      const { error } = await supabase.from("vr_partner_contributions").update(patch).eq("id", id);
      if (error) throw new Error(dupMsg(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_partner_contributions"] }),
  });
}

// Uloženie/úprava spoločného vkladu — vždy prepočíta sumy podľa režimu.
export function useSaveVrContributionGroup() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: async (input: {
      groupId?: string | null;
      existingIds?: string[];
      partnerIds: string[];
      paid_on: string;
      total: number;
      shareMode: VrShareMode;
      purpose: string;
      category: string;
      note?: string | null;
      items?: VrContribItem[] | null;
    }) => {
      const gid = input.groupId ?? crypto.randomUUID();
      const shared = input.partnerIds.length > 1;
      const per = shared && input.shareMode === "half" ? splitEven(input.total, 2) : null;

      // existujúce riadky (skupina alebo konkrétne id-čka pri úprave)
      const rows: { id: string }[] = (input.existingIds ?? []).map((id) => ({ id }));
      if (!rows.length && input.groupId) {
        const { data } = await supabase
          .from("vr_partner_contributions")
          .select("id")
          .eq("group_id", gid);
        rows.push(...((data ?? []) as { id: string }[]));
      }


      for (let i = 0; i < input.partnerIds.length; i++) {
        const pid = input.partnerIds[i];
        const amount = per ? per[i] : input.total;
        const payload = {
          partner_id: pid,
          paid_on: input.paid_on,
          amount,
          purpose: input.purpose,
          category: input.category,
          note: input.note ?? null,
          group_id: shared ? gid : null,
          share_mode: shared ? input.shareMode : "single",
          total_amount: input.total,
          items: input.items?.length ? input.items : null,
        };
        const match = rows[i];
        const { error } = match
          ? await supabase.from("vr_partner_contributions").update(payload).eq("id", match.id)
          : await supabase
              .from("vr_partner_contributions")
              .insert({ ...payload, created_by: userId });
        if (error) throw new Error(dupMsg(error));
      }

      // odstráň prebytočné riadky (napr. zo spoločného na jednotlivca)
      const extra = rows.slice(input.partnerIds.length).map((r) => r.id);
      if (extra.length) await supabase.from("vr_partner_contributions").delete().in("id", extra);
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
      if (error) throw new Error(dupMsg(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vr_finance_records"] }),
  });
}

export function useUpdateVrFinanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<VrFinanceRecord> }) => {
      const { error } = await supabase.from("vr_finance_records").update(patch).eq("id", id);
      if (error) throw new Error(dupMsg(error));
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

/* ------------------- Report za zvolený interval ------------------- */

// Výdaje/príjmy za ľubovoľný rozsah dátumov (pre PDF report).
export function useVrFinanceRange(from: string, to: string, enabled = true) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: ["vr_finance_records_range", from, to],
    enabled: !!userId && enabled && !!from && !!to,
    queryFn: async (): Promise<VrFinanceRecord[]> => {
      const { data, error } = await supabase
        .from("vr_finance_records")
        .select(FR_COLS)
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("occurred_on", { ascending: true });
      if (error) {
        console.warn("VR report: vr_finance_records nedostupné", error.message);
        return [];
      }
      return (data ?? []) as VrFinanceRecord[];
    },
  });
}

// Úhrady spoločníkov za rozsah dátumov.
export function useVrContributionsRange(from: string, to: string, enabled = true) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: ["vr_partner_contributions_range", from, to],
    enabled: !!userId && enabled && !!from && !!to,
    queryFn: async (): Promise<VrPartnerContribution[]> => {
      const { data, error } = await supabase
        .from("vr_partner_contributions")
        .select(PC_COLS)
        .gte("paid_on", from)
        .lte("paid_on", to)
        .order("paid_on", { ascending: true });
      if (error) {
        console.warn("VR report: vr_partner_contributions nedostupné", error.message);
        return [];
      }
      return (data ?? []) as VrPartnerContribution[];
    },
  });
}
