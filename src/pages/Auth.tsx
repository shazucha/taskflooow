import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!isSupabaseConfigured || !supabase) {
      toast.error("Supabase nie je nakonfigurované. Pridaj VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
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
          <h1 className="text-2xl font-bold tracking-tight">Vitaj späť</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prihlás sa cez magic link</p>
        </div>

        {sent ? (
          <div className="card-elevated p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm font-semibold">Skontroluj email</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Poslali sme prihlasovací odkaz na <strong>{email}</strong>.
            </p>
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
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Posielam..." : "Poslať magic link"}
            </Button>
            {!isSupabaseConfigured && (
              <p className="text-[11px] text-muted-foreground">
                Supabase zatiaľ nie je nakonfigurované. Aplikácia beží v demo režime.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
