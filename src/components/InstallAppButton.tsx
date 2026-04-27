import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  // Detect platform and current display mode
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as any).standalone === true);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already installed / running as PWA — hide button entirely.
  if (isStandalone || installed) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDeferredPrompt(null);
      return;
    }
    // No native prompt available (typically iOS Safari, or browser hasn't fired it yet).
    setIosHelpOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={handleClick}
      >
        {isIOS ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        Stiahnuť aplikáciu
      </Button>

      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pridať na plochu</DialogTitle>
            <DialogDescription>
              {isIOS
                ? "Inštalácia na iPhone/iPad sa robí cez Safari."
                : "Tvoj prehliadač nezobrazil automatickú výzvu. Použi menu prehliadača."}
            </DialogDescription>
          </DialogHeader>
          {isIOS ? (
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>
                1. Otvor túto stránku v <strong>Safari</strong>.
              </li>
              <li className="flex items-center gap-2">
                2. Klikni na ikonu <Share className="inline h-4 w-4" /> (Zdieľať)
                v dolnej lište.
              </li>
              <li>
                3. Zvoľ <strong>„Pridať na plochu"</strong> (Add to Home Screen).
              </li>
              <li>
                4. Potvrď tlačidlom <strong>Pridať</strong>.
              </li>
            </ol>
          ) : (
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>
                1. Otvor menu prehliadača (⋮ alebo ikona inštalácie v adresnom
                riadku).
              </li>
              <li>
                2. Zvoľ <strong>„Inštalovať aplikáciu"</strong> alebo{" "}
                <strong>„Pridať na plochu"</strong>.
              </li>
              <li>3. Potvrď inštaláciu.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}