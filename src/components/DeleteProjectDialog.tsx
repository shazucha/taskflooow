import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteProject } from "@/lib/queries";
import { toast } from "sonner";

export function DeleteProjectDialog({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const del = useDeleteProject();
  const navigate = useNavigate();

  const matches = confirm.trim() === projectName.trim();

  const submit = async () => {
    if (!matches) return;
    try {
      await del.mutateAsync(projectId);
      toast.success("Projekt zmazaný");
      setOpen(false);
      navigate("/projects");
    } catch (e: any) {
      toast.error(e.message ?? "Nepodarilo sa zmazať projekt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Zmazať
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Zmazať projekt</DialogTitle>
          <DialogDescription>
            Táto akcia je nezvratná. Zmaže sa projekt a všetky jeho úlohy, práce a chat.
            Pre potvrdenie napíš presný názov projektu: <span className="font-semibold text-foreground">{projectName}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-name">Názov projektu</Label>
          <Input
            id="confirm-name"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={projectName}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button
            variant="destructive"
            disabled={!matches || del.isPending}
            onClick={submit}
          >
            {del.isPending ? "Mažem..." : "Zmazať natrvalo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
