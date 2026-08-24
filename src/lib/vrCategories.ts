// Kategórie/typy pre VR financie — uložené v Supabase (spoločné pre všetkých).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useCurrentUserId } from "./queries";

export type VrCatScope = "contribution" | "expense" | "income";

export interface VrCategory {
  id: string; // = key použitý v záznamoch
  rowId: string;
  label: string;
  isDefault: boolean;
}

export const VR_SCOPE_LABEL: Record<VrCatScope, string> = {
  contribution: "Firma / zdroj úhrady",
  expense: "Dodávateľ / firma",
  income: "Od koho / firma",
};

const QK = ["vr_categories"] as const;

// Cache popiskov, aby vrCatLabel fungoval synchrónne v sumároch.
const labelCache = new Map<string, string>();

function slug(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || `cat_${Date.now()}`
  );
}

interface Row {
  id: string;
  scope: VrCatScope;
  key: string;
  label: string;
  is_default: boolean;
  position: number;
}

export function useVrAllCategories() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: QK,
    enabled: !!userId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("vr_categories")
        .select("id,scope,key,label,is_default,position")
        .order("position", { ascending: true })
        .order("label", { ascending: true });
      if (error) {
        console.warn("VR kategórie nedostupné", error.message);
        return [];
      }
      const rows = (data ?? []) as Row[];
      rows.forEach((r) => labelCache.set(`${r.scope}:${r.key}`, r.label));
      return rows;
    },
  });
}

export function useVrCategories(scope: VrCatScope): VrCategory[] {
  const { data = [] } = useVrAllCategories();
  return useMemo(
    () =>
      data
        .filter((r) => r.scope === scope)
        .map((r) => ({ id: r.key, rowId: r.id, label: r.label, isDefault: r.is_default })),
    [data, scope]
  );
}

export function useVrCategoryActions(scope: VrCatScope) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const add = useMutation({
    mutationFn: async (label: string) => {
      const name = label.trim();
      if (!name) throw new Error("Zadaj názov kategórie.");
      const { error } = await supabase
        .from("vr_categories")
        .insert({ scope, key: slug(name), label: name, created_by: userId });
      if (error) {
        if (error.code === "23505") throw new Error("Taká kategória už existuje.");
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async ({ rowId, label }: { rowId: string; label: string }) => {
      const name = label.trim();
      if (!name) throw new Error("Názov nemôže byť prázdny.");
      const { error } = await supabase.from("vr_categories").update({ label: name }).eq("id", rowId);
      if (error) {
        if (error.code === "23505") throw new Error("Taká kategória už existuje.");
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("vr_categories").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, rename, remove };
}

// Synchrónny popisok z cache (naplní ju useVrAllCategories).
export function vrCatLabel(scope: VrCatScope, id: string) {
  return (
    labelCache.get(`${scope}:${id}`) ??
    labelCache.get(`contribution:${id}`) ??
    labelCache.get(`expense:${id}`) ??
    labelCache.get(`income:${id}`) ??
    id
  );
}
