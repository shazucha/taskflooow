import { useEffect, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { toast } from "sonner";

const PREVIEW_AUTH_REDIRECT = "https://id-preview--c29c1f95-f678-4c0a-8c07-dbf8cd89b342.lovable.app";
const PUBLISHED_AUTH_REDIRECT = "https://taskflooow.lovable.app";

const getAuthRedirectUrl = () => {
  const origin = window.location.origin;

  if (origin.includes("lovableproject.com")) {
    return PREVIEW_AUTH_REDIRECT;
  }

  if (
    origin === PREVIEW_AUTH_REDIRECT ||
    origin === PUBLISHED_AUTH_REDIRECT ||
    origin.includes("localhost")
  ) {
    return origin;
  }

  return PUBLISHED_AUTH_REDIRECT;
};

export default function Auth() {
  const { user, loading } = useSession();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sent) {
      // No-op; UI handles state
    }
  }, [sent]);

  const redirectPreview = new URL("/", getAuthRedirectUrl()).toString();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    const redirectTo = redirectPreview;
    console.log("[Auth] magic link redirectTo:", redirectTo, "origin:", window.location.origin);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else setSent(true);
  };

  return (
    <div className="app-shell flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Vitaj v TaskFlow</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prihlás sa cez magic link</p>
        </div>

        {sent ? (
          <div className="card-elevated p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm font-semibold">Skontroluj email</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Poslali sme prihlasovací odkaz na <strong>{email}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="mt-4 text-xs font-medium text-primary hover:underline"
            >
              Použiť iný email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="card-elevated space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ty@firma.sk"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Posielam..." : "Poslať magic link"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Po kliknutí na odkaz v emaili budeš automaticky prihlásený.
            </p>
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-2">
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                <strong>Debug redirect:</strong> {redirectPreview}
              </p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                <strong>Origin:</strong> {typeof window !== "undefined" ? window.location.origin : ""}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
