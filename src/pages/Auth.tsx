import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Nesprávny email alebo heslo");
    }
  };

  return (
    <div className="app-shell flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Vitaj v TaskFlow</h1>
          <p className="mt-1 text-sm text-muted-foreground">Interná aplikácia — prihlásenie</p>
        </div>

        <form onSubmit={submit} className="card-elevated space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="meno@firma.sk"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Prihlasujem..." : "Prihlásiť"}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Účet ti vytvorí administrátor.
          </p>
        </form>
      </div>
    </div>
  );
}
