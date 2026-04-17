import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { KeyRound, LogOut, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUserId, useProfiles, useTasks } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Profile() {
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const currentUserId = useCurrentUserId();
  const navigate = useNavigate();
  const me = profiles.find((p) => p.id === currentUserId);

  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      toast.error("Heslo musí mať aspoň 8 znakov");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Heslá sa nezhodujú");
      return;
    }
    setPwSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Heslo bolo zmenené");
    setPwOpen(false);
    setNewPw("");
    setConfirmPw("");
  };

  const myDone = tasks.filter((t) => t.assignee_id === currentUserId && t.status === "done").length;
  const myOpen = tasks.filter((t) => t.assignee_id === currentUserId && t.status !== "done").length;

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Odhlásený");
    navigate("/auth", { replace: true });
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Profil</h1>

      <div className="card-elevated mt-5 flex items-center gap-4 p-5">
        <UserAvatar profile={me} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {me?.full_name ?? me?.email?.split("@")[0]}
          </h2>
          <p className="truncate text-xs text-muted-foreground inline-flex items-center gap-1">
            <Mail className="h-3 w-3" /> {me?.email}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="card-elevated p-4">
          <p className="text-xs font-medium text-muted-foreground">Otvorené</p>
          <p className="mt-1 text-2xl font-bold">{myOpen}</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-xs font-medium text-muted-foreground">Dokončené</p>
          <p className="mt-1 text-2xl font-bold text-success">{myDone}</p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4" /> Tím
        </h2>
        <div className="card-elevated divide-y divide-border/60">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3.5">
              <UserAvatar profile={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.full_name ?? p.email}</p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              {p.id === currentUserId && (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">VY</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <Button
        variant="outline"
        className="mt-6 w-full gap-2 rounded-xl"
        onClick={() => setPwOpen(true)}
      >
        <KeyRound className="h-4 w-4" /> Zmeniť heslo
      </Button>

      <Button variant="outline" className="mt-3 w-full gap-2 rounded-xl" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Odhlásiť
      </Button>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zmena hesla</DialogTitle>
            <DialogDescription>Zadaj nové heslo (min. 8 znakov).</DialogDescription>
          </DialogHeader>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Nové heslo</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Potvrdiť heslo</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>
                Zrušiť
              </Button>
              <Button type="submit" disabled={pwSubmitting}>
                {pwSubmitting ? "Ukladám..." : "Uložiť"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
