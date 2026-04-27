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

type WindowWithPrompt = typeof window & {
  __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  __pwaInstalled?: boolean;
};

function getStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  if ((window.navigator as unknown as { standalone?: boolean }).standalone)
    return true;
  return false;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

export function InstallAppButton() {
  // Initialize from any prompt captured before React mounted (see main.tsx).
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(() => {
      if (typeof window === "undefined") return null;
      return (window as WindowWithPrompt).__deferredInstallPrompt ?? null;
    });
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      (window as WindowWithPrompt).__pwaInstalled === true || getStandalone()
    );
  });
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  const isIOS = detectIOS();
  const isStandalone = getStandalone();

  useEffect(() => {
    const w = window as WindowWithPrompt;

    // Re-sync from the early-capture stash in case it arrived between
    // module import and effect mount.
    if (w.__deferredInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(w.__deferredInstallPrompt);
    }
    if (w.__pwaInstalled && !installed) setInstalled(true);

    const onAvailable = () => {
      const evt = (window as WindowWithPrompt).__deferredInstallPrompt;
      if (evt) setDeferredPrompt(evt);
    };
    const onInstalledEvt = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    // Also listen to the native events directly — covers the case where
    // the component mounts before main.tsx's listener fires the custom event.
    const onNativePrompt = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      (window as WindowWithPrompt).__deferredInstallPrompt = evt;
      setDeferredPrompt(evt);
    };
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setInstalled(true);
    };

    window.addEventListener("pwa-install-available", onAvailable);
    window.addEventListener("pwa-installed", onInstalledEvt);
    window.addEventListener("beforeinstallprompt", onNativePrompt);
    window.addEventListener("appinstalled", onInstalledEvt);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", onDisplayModeChange);

    return () => {
      window.removeEventListener("pwa-install-available", onAvailable);
      window.removeEventListener("pwa-installed", onInstalledEvt);
      window.removeEventListener("beforeinstallprompt", onNativePrompt);
      window.removeEventListener("appinstalled", onInstalledEvt);
      mq?.removeEventListener?.("change", onDisplayModeChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already installed / running as PWA — hide button entirely.
  if (isStandalone || installed) return null;

  // Show the button only when we have a real install signal:
  //  - Chrome/Edge/Android: a captured `beforeinstallprompt` event
  //  - iOS Safari: never fires the event, but install is possible via Share
  const canInstall = !!deferredPrompt || isIOS;
  if (!canInstall) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        // The prompt event can only be used once — clear it either way.
        (window as WindowWithPrompt).__deferredInstallPrompt = null;
        setDeferredPrompt(null);
        if (outcome === "accepted") setInstalled(true);
      } catch {
        (window as WindowWithPrompt).__deferredInstallPrompt = null;
        setDeferredPrompt(null);
      }
      return;
    }
    // iOS Safari path — show manual instructions.
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