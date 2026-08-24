// Vyrovnanie pôžičky konateľa — vygeneruje splátku (loan_repay) a uzavrie dlh.
import { useEffect, useState } from "react";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { eur, useCreateVrFinanceRecord } from "@/lib/vrFinanceApi";

interface Props {
  partnerId: string | null;
  partnerName: string;
  outstanding: number; // kladné číslo = koľko firma dlhuje
}

function monthKeyOf(iso: string) {
  return iso.slice(0, 7);
}

export function VrLoanSettleDialog({ partnerId, partnerName, outstanding }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const create = useCreateVrFinanceRecord();

  // Predvyplň celý zostatok pri otvorení.
  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
      setDate(new Date().toISOString().slice(0, 10));
      setTitle(`Vyrovnanie pôžičky — ${partnerName}`);
    }
  }, [open, outstanding, partnerName]);

  async function submit() {
    const value = Number(String(amount).trim().replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return toast.error("Zadaj sumu väčšiu ako 0.");
    if (value > outstanding + 0.005) return toast.error(`Maximálne ${eur(outstanding)} — viac firma nedlhuje.`);
    if (!date) return toast.error("Vyber dátum splátky.");
    try {
      await create.mutateAsync({
        month_key: monthKeyOf(date),
        occurred_on: date,
        direction: "loan_repay",
        amount: value,
        title: title.trim() || `Vyrovnanie pôžičky — ${partnerName}`,
        category: "ine",
        recurring: false,
        note: null,
        partner_id: partnerId,
        revenue_kind: null,
      });
      toast.success(
        value >= outstanding - 0.005
          ? `Dlh voči ${partnerName} je vyrovnaný.`
          : `Splátka ${eur(value)} zapísaná. Zostáva ${eur(outstanding - value)}.`
      );
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rest = Math.max(0, outstanding - (Number(String(amount).replace(",", ".")) || 0));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={outstanding <= 0}>
          <HandCoins className="mr-1 h-3.5 w-3.5" /> Vyrovnať
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vyrovnať pôžičku — {partnerName}</DialogTitle>
          <DialogDescription>
            Vytvorí sa splátka (záväzok firmy voči konateľovi sa zníži). Aktuálny dlh: {eur(outstanding)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Dátum splátky" />
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Suma splátky v €"
              aria-label="Suma splátky"
            />
            <Button type="button" variant="outline" onClick={() => setAmount(outstanding.toFixed(2))}>
              Celý dlh
            </Button>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Popis splátky"
            aria-label="Popis splátky"
          />
          <p className="text-xs text-muted-foreground">
            Po zapísaní zostane dlh: <span className="font-semibold tabular-nums">{eur(rest)}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={submit} disabled={create.isPending} className="bg-vr text-vr-foreground hover:bg-vr/90">
            Zapísať splátku
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
