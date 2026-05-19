import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { disablePush, enablePush, getPushStatus, pushSupported } from "@/lib/push";

interface Props {
  userId: string | null;
}

/** Karta v profile pre zapnutie/vypnutie Web Push notifikácií. */
export function PushNotificationsCard({ userId }: Props) {
  const [status, setStatus] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!pushSupported()) {
      setStatus("unsupported");
      return;
    }
    getPushStatus().then((s) => { if (mounted) setStatus(s); });
    return () => { mounted = false; };
  }, []);

  const toggle = async (next: boolean) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      if (next) {
        await enablePush(userId);
        setStatus("on");
        toast.success("Notifikácie zapnuté");
      } else {
        await disablePush();
        setStatus("off");
        toast.success("Notifikácie vypnuté");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
      const s = await getPushStatus();
      setStatus(s);
    } finally {
      setBusy(false);
    }
  };

  const isOn = status === "on";
  const disabled = status === "unsupported" || status === "denied" || status === "loading" || busy;

  let hint = "Dostávaj upozornenia na nové správy a priradené úlohy aj keď je appka zavretá.";
  if (status === "unsupported") {
    hint = "Tento prehliadač push notifikácie nepodporuje. Na iPhone si appku najprv pridaj na plochu (Share → Pridať na plochu).";
  } else if (status === "denied") {
    hint = "Notifikácie sú v prehliadači blokované. Povoľ ich v nastaveniach prehliadača a obnov stránku.";
  }

  return (
    <section className="card-elevated mt-4 flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {isOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Push notifikácie</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Tichý režim 22:00–07:00 (notifikácie sa v noci neposielajú).
        </p>
      </div>
      <Switch
        checked={isOn}
        disabled={disabled}
        onCheckedChange={toggle}
        aria-label="Prepnúť push notifikácie"
      />
    </section>
  );
}