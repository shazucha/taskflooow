// Správa kategórií/typov pre VR financie (úhrady, výdaje, príjmy).
// Vlastné kategórie sa ukladajú lokálne (localStorage), defaulty sú vstavané.
import { useSyncExternalStore } from "react";

export type VrCatScope = "contribution" | "expense" | "income";

export interface VrCategory {
  id: string;
  label: string;
}

export const VR_SCOPE_LABEL: Record<VrCatScope, string> = {
  contribution: "Typ úhrady",
  expense: "Typ výdavku",
  income: "Typ príjmu",
};

const DEFAULTS: Record<VrCatScope, VrCategory[]> = {
  contribution: [
    { id: "prevadzka", label: "Prevádzka" },
    { id: "najom", label: "Nájom a energie" },
    { id: "technika", label: "Technika a VR" },
    { id: "software", label: "Softvér a licencie" },
    { id: "marketing", label: "Marketing" },
    { id: "uctovnictvo", label: "Účtovníctvo a odvody" },
    { id: "ine", label: "Iné" },
  ],
  expense: [
    { id: "prevadzka", label: "Prevádzka" },
    { id: "najom", label: "Nájom a energie" },
    { id: "technika", label: "Technika a VR" },
    { id: "software", label: "Softvér a licencie" },
    { id: "marketing", label: "Marketing" },
    { id: "uctovnictvo", label: "Účtovníctvo a odvody" },
    { id: "ine", label: "Iné" },
  ],
  income: [
    { id: "vklad_konatela", label: "Vklad konateľa" },
    { id: "vklad_spolocnika", label: "Vklad spoločníka" },
    { id: "trzby", label: "Tržby zo sessions" },
    { id: "ine_prijmy", label: "Iné príjmy" },
  ],
};

const STORAGE_KEY = "vr-finance-categories-v1";

type Store = Partial<Record<VrCatScope, VrCategory[]>>;

let custom: Store = load();
const listeners = new Set<() => void>();

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

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

// Snapshot cache — useSyncExternalStore potrebuje stabilnú referenciu.
const snapshots = new Map<VrCatScope, VrCategory[]>();

function computeSnapshot(scope: VrCatScope): VrCategory[] {
  const list = [...DEFAULTS[scope], ...(custom[scope] ?? [])];
  const prev = snapshots.get(scope);
  if (prev && prev.length === list.length && prev.every((c, i) => c.id === list[i].id && c.label === list[i].label)) {
    return prev;
  }
  snapshots.set(scope, list);
  return list;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getVrCategories(scope: VrCatScope): VrCategory[] {
  return computeSnapshot(scope);
}

export function useVrCategories(scope: VrCatScope): VrCategory[] {
  return useSyncExternalStore(
    subscribe,
    () => computeSnapshot(scope),
    () => computeSnapshot(scope)
  );
}

export function addVrCategory(scope: VrCatScope, label: string): VrCategory | null {
  const name = label.trim();
  if (!name) return null;
  const exists = computeSnapshot(scope).some((c) => c.label.toLowerCase() === name.toLowerCase());
  if (exists) return null;
  const cat = { id: slug(name), label: name };
  custom = { ...custom, [scope]: [...(custom[scope] ?? []), cat] };
  persist();
  return cat;
}

export function renameVrCategory(scope: VrCatScope, id: string, label: string) {
  const name = label.trim();
  if (!name) return;
  const list = custom[scope] ?? [];
  if (list.some((c) => c.id === id)) {
    custom = { ...custom, [scope]: list.map((c) => (c.id === id ? { ...c, label: name } : c)) };
  } else {
    // premenovanie vstavanej kategórie – uložíme override s rovnakým id
    custom = { ...custom, [scope]: [...list, { id, label: name }] };
  }
  persist();
}

export function removeVrCategory(scope: VrCatScope, id: string) {
  custom = { ...custom, [scope]: (custom[scope] ?? []).filter((c) => c.id !== id) };
  persist();
}

export function isCustomVrCategory(scope: VrCatScope, id: string) {
  return !DEFAULTS[scope].some((c) => c.id === id);
}

// Popisok kategórie – hľadá naprieč všetkými scope, aby fungoval aj v sumároch.
export function vrCatLabel(scope: VrCatScope, id: string) {
  const own = computeSnapshot(scope).filter((c) => c.id === id);
  if (own.length) return own[own.length - 1].label; // override má prednosť
  for (const s of ["contribution", "expense", "income"] as VrCatScope[]) {
    const hit = computeSnapshot(s).find((c) => c.id === id);
    if (hit) return hit.label;
  }
  return id;
}
