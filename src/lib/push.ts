// Klientske helpre pre Web Push notifikácie.
import { supabase } from "./supabase";

export const VAPID_PUBLIC_KEY =
  "BEfdTMgeg7tO--F6E7nP2vTCy1ZOlLrQx08Yz822Na1fZv9REeg5Hey3TwowTGt4qUpFvjfUugUyU98YiYtSne0";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Zaregistruje minimálny SW pre push (ak ešte nie je). */
async function ensureSWRegistered(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return await navigator.serviceWorker.register("/sw.js");
}

/** Spýta sa o povolenie + vytvorí push subscription a uloží do DB. */
export async function enablePush(userId: string): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error("Tento prehliadač nepodporuje push notifikácie.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifikácie zamietnuté.");

  const reg = await ensureSWRegistered();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Neplatná subscription.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: json.endpoint,
      user_id: userId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;

  return sub;
}

/** Zruší push subscription a vymaže ju z DB. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch { /* ignore */ }
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** Zistí, či má užívateľ aktívnu push subscription. */
export async function getPushStatus(): Promise<"unsupported" | "denied" | "off" | "on"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return "off";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/**
 * Pošle push notifikáciu cez edge function. Best-effort — chyby
 * iba zalogujeme, aby zlyhanie pushu nikdy nezhodilo hlavnú akciu.
 */
export async function notifyUsers(input: {
  user_ids: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  try {
    const ids = Array.from(new Set((input.user_ids ?? []).filter(Boolean)));
    if (ids.length === 0) return;
    const { error } = await supabase.functions.invoke("send-push", {
      body: { ...input, user_ids: ids },
    });
    if (error) console.warn("send-push failed:", error.message);
  } catch (e) {
    console.warn("notifyUsers error:", e);
  }
}