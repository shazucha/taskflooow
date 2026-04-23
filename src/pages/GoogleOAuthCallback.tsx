import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { completeGoogleOAuth } from "@/lib/googleCalendar";
import { toast } from "sonner";

export default function GoogleOAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = params.get("code");
    const errParam = params.get("error");

    if (errParam) {
      setError(errParam);
      toast.error(`Google: ${errParam}`);
      return;
    }
    if (!code) {
      setError("missing_code");
      return;
    }

    completeGoogleOAuth(code)
      .then((res) => {
        toast.success(res.email ? `Pripojené: ${res.email}` : "Google kalendár pripojený");
        navigate("/me", { replace: true });
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "OAuth zlyhalo";
        setError(msg);
        toast.error(msg);
      });
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card-elevated max-w-sm p-6 text-center">
        {error ? (
          <>
            <p className="text-sm font-semibold text-destructive">Chyba pri pripojení</p>
            <p className="mt-2 text-xs text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate("/me")}
              className="mt-4 text-xs font-semibold text-primary underline"
            >
              Späť na profil
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-semibold">Dokončujem pripojenie Google kalendára…</p>
          </>
        )}
      </div>
    </div>
  );
}