import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { Check, KeyRound, LogOut, Mail, Moon, Pencil, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUserId, useProfiles, useTasks, useUpdateProfile } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GoogleCalendarConnect } from "@/components/GoogleCalendarConnect";
import { useTheme } from "@/lib/useTheme";

const COLOR_OPTIONS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#ec4899", // pink
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#f97316", // orange
  "#84cc16", // lime
];

export default function Profile() {
  const { data: profiles = [] } = useProfiles();
  const { data: tasks = [] } = useTasks();
  const currentUserId = useCurrentUserId();
  const navigate = useNavigate();
  const me = profiles.find((p) => p.id === currentUserId);
  const updateProfile = useUpdateProfile();
  const { theme, toggle: toggleTheme } = useTheme();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    if (me) setName(me.full_name ?? "");
  }, [me?.id, me?.full_name]);

  const myDone = tasks.filter((t) => t.assignee_id === currentUserId && t.status === "done").length;
  const myOpen = tasks.filter((t) => t.assignee_id === currentUserId && t.status !== "done").length;

  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const saveName = async () => {
    if (!currentUserId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Zadaj meno");
      return;
    }
    setSavingName(true);
    try {
      await updateProfile.mutateAsync({ id: currentUserId, patch: { full_name: trimmed } });
      toast.success("Meno uložené");
      setEditingName(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setSavingName(false);
    }
  };

  const pickColor = async (color: string) => {
    if (!currentUserId) return;
    try {
      await updateProfile.mutateAsync({ id: currentUserId, patch: { color } });
      toast.success("Farba zmenená");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  };

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

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Odhlásený");
    navigate("/auth", { replace: true });
  };

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Profil</h1>
      <div className="md:grid md:grid-cols-2 md:gap-6">
        <div>

      <div className="card-elevated mt-5 flex items-center gap-4 p-5">
        <UserAvatar profile={me} size="lg" />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tvoje meno"
                autoFocus
                className="h-9"
              />
              <Button size="sm" onClick={saveName} disabled={savingName}>
                Uložiť
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold">
                {me?.full_name?.trim() || "Bez mena"}
              </h2>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Upraviť meno"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="mt-1 inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3" /> {me?.email}
          </p>
        </div>
      </div>

      <section className="card-elevated mt-4 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Moja farba</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Použije sa pre tvoje úlohy v kalendári.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => {
            const active = me?.color === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => pickColor(c)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition",
                  active ? "ring-foreground" : "ring-transparent hover:ring-border"
                )}
                style={{ backgroundColor: c }}
                aria-label={`Vybrať farbu ${c}`}
              >
                {active && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </section>

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

      <GoogleCalendarConnect />

      <section className="card-elevated mt-4 flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Tmavý režim</p>
          <p className="text-xs text-muted-foreground">
            Šetrnejší pre oči pri práci v noci.
          </p>
        </div>
        <Switch
          checked={theme === "dark"}
          onCheckedChange={toggleTheme}
          aria-label="Prepnúť tmavý režim"
        />
      </section>
        </div>
        <div>

      <section className="mt-6 md:mt-5">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4" /> Tím
        </h2>
        <div className="card-elevated divide-y divide-border/60">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3.5">
              <UserAvatar profile={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.full_name?.trim() || p.email}</p>
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
        </div>
      </div>

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
