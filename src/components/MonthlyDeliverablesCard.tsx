import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/UserAvatar";
import { UserCircle2 } from "lucide-react";
import {
  useCreateMonthlyWork,
  useCurrentUserId,
  useDeleteMonthlyWork,
  useEnsureMonthlySnapshot,
  useIsAppAdmin,
  useMonthlyWorkCompletions,
  useMonthlyWorkComments,
  useMyMonthlyWorkCommentReads,
  useMarkMonthlyWorkCommentsRead,
  useProfiles,
  useProjectMonthlyWorks,
  useProjectRecurringWorks,
  useRecurringWorkCompletions,
  useReorderMonthlyWorks,
  useResetMonthlySnapshot,
  useSaveSnapshotAsTemplate,
  useToggleMonthlyWorkDone,
  useToggleRecurringWorkDone,
  useUpdateMonthlyWork,
} from "@/lib/queries";
import { MonthlyWorkCommentsPanel } from "./MonthlyWorkCommentsPanel";
import type { Profile } from "@/lib/types";
import { NewTaskDialog } from "./NewTaskDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currentMonthKey, formatMonthLabel, shiftMonth } from "@/lib/recurring";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  projectId: string;
}

/** Unifikovaná položka, ktorú vykresľujeme — môže byť zo šablóny alebo zo snapshotu. */
type Row = {
  id: string;
  title: string;
  note: string | null;
  position: number;
  assignee_id: string | null;
};

function SortableRow({
  row,
  done,
  editable,
  onToggle,
  onOpenTask,
  onDelete,
  onEdit,
  onAssign,
  onToggleComments,
  commentCount,
  commentsOpen,
  assignee,
  profiles,
  toggleDisabled,
}: {
  row: Row;
  done: boolean;
  editable: boolean;
  onToggle: () => void;
  onOpenTask: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onAssign: (userId: string | null) => void;
  onToggleComments: () => void;
  commentCount: number;
  commentsOpen: boolean;
  assignee: Profile | null;
  profiles: Profile[];
  toggleDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id, disabled: !editable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  const accentColor = assignee?.color || null;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 overflow-hidden rounded-xl border px-2 py-2 pl-3 transition",
        done
          ? "border-success/30 bg-success/5"
          : "border-border bg-surface-muted/40 hover:border-primary/40",
        isDragging && "shadow-lg ring-2 ring-primary/40"
      )}
    >
      {accentColor && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
          style={{ backgroundColor: accentColor }}
        />
      )}
      {editable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
          aria-label="Presunúť"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        disabled={toggleDisabled}
        onClick={onToggle}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
          done
            ? "border-success bg-success text-success-foreground"
            : "border-border bg-card hover:border-primary"
        )}
        aria-label={done ? "Označiť ako nehotové" : "Označiť ako hotové"}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onOpenTask}
        className={cn(
          "min-w-0 flex-1 text-left text-sm transition",
          done ? "text-muted-foreground line-through" : "text-foreground hover:text-primary"
        )}
        title={row.note ?? `Vytvoriť úlohu: ${row.title}`}
      >
        <span className="truncate block">{row.title}</span>
        {row.note && (
          <span className="block truncate text-[11px] text-muted-foreground">{row.note}</span>
        )}
        {assignee && (
          <span className="mt-0.5 block truncate text-[10px] font-medium" style={{ color: accentColor ?? undefined }}>
            {assignee.full_name ?? assignee.email ?? "Priradené"}
          </span>
        )}
      </button>
      {editable ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition",
              assignee
                ? "hover:opacity-80"
                : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
            )}
            aria-label={assignee ? `Priradené: ${assignee.full_name ?? "—"}` : "Priradiť osobu"}
            title={assignee ? `Priradené: ${assignee.full_name ?? assignee.email ?? ""}` : "Priradiť osobu"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {assignee ? (
              <UserAvatar profile={assignee} size="sm" />
            ) : (
              <UserCircle2 className="h-5 w-5" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onClick={() => onAssign(null)}>
            <UserCircle2 className="mr-2 h-4 w-4" /> Nepriradené
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {profiles.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => onAssign(p.id)}>
              <UserAvatar profile={p} size="sm" className="mr-2 ring-0" />
              <span className="truncate">{p.full_name ?? p.email ?? p.id}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      ) : assignee ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center"
          title={`Priradené: ${assignee.full_name ?? assignee.email ?? ""}`}
        >
          <UserAvatar profile={assignee} size="sm" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleComments(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition",
          commentsOpen
            ? "bg-primary/15 text-primary"
            : commentCount > 0
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
        )}
        aria-label={commentCount > 0 ? `${commentCount} komentárov` : "Komentovať"}
        title={commentCount > 0 ? `${commentCount} komentárov` : "Komentovať"}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {commentCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
            {commentCount}
          </span>
        )}
      </button>
      {editable && (
        <>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            aria-label="Upraviť"
            title="Upraviť"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            aria-label="Odstrániť"
            title="Odstrániť"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

export function MonthlyDeliverablesCard({ projectId }: Props) {
  const userId = useCurrentUserId();
  const isAdmin = useIsAppAdmin();
  const { data: profiles = [] } = useProfiles();

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());

  // Šablóna + staré completions (fallback ak nie je snapshot)
  const { data: tplWorks = [], isLoading: tplLoading } = useProjectRecurringWorks(projectId);
  const { data: tplCompletions = [] } = useRecurringWorkCompletions(projectId);

  // Mesačný snapshot
  const { data: snapWorks = [], isLoading: snapLoading } = useProjectMonthlyWorks(projectId, monthKey);
  const { data: snapCompletions = [] } = useMonthlyWorkCompletions(projectId, monthKey);

  // Komentáre k položkám náplne (pre celý mesiac, zoskupené po work_id)
  const { data: workComments = [] } = useMonthlyWorkComments(projectId, monthKey);
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const markReadMut = useMarkMonthlyWorkCommentsRead();

  const commentsByWork = useMemo(() => {
    const m = new Map<string, typeof workComments>();
    for (const c of workComments) {
      const arr = m.get(c.work_id) ?? [];
      arr.push(c);
      m.set(c.work_id, arr);
    }
    return m;
  }, [workComments]);

  const workIdsWithComments = useMemo(
    () => Array.from(commentsByWork.keys()),
    [commentsByWork]
  );
  const { data: readRows = [] } = useMyMonthlyWorkCommentReads(workIdsWithComments);
  const readByWork = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of readRows) m.set(r.work_id, new Date(r.last_read_at).getTime());
    return m;
  }, [readRows]);

  const unreadCount = (workId: string) => {
    const list = commentsByWork.get(workId);
    if (!list || list.length === 0) return 0;
    const lastRead = readByWork.get(workId) ?? 0;
    let n = 0;
    for (const c of list) {
      if (c.user_id === userId) continue;
      if (new Date(c.created_at).getTime() > lastRead) n++;
    }
    return n;
  };

  const handleToggleComments = (workId: string) => {
    setOpenCommentsId((cur) => {
      const next = cur === workId ? null : workId;
      if (next && userId) {
        markReadMut.mutate(next);
      }
      return next;
    });
  };

  const hasSnapshot = snapWorks.length > 0;

  // Mutácie — snapshot
  const createSnap = useCreateMonthlyWork(projectId, monthKey);
  const updateSnap = useUpdateMonthlyWork(projectId, monthKey);
  const deleteSnap = useDeleteMonthlyWork(projectId, monthKey);
  const reorderSnap = useReorderMonthlyWorks(projectId, monthKey);
  const toggleSnap = useToggleMonthlyWorkDone(projectId, monthKey);
  const resetSnap = useResetMonthlySnapshot(projectId, monthKey);
  const saveTpl = useSaveSnapshotAsTemplate(projectId, monthKey);
  const ensureSnap = useEnsureMonthlySnapshot(projectId, monthKey);

  // Mutácia — toggle nad šablónou (keď snapshot ešte nie je)
  const toggleTpl = useToggleRecurringWorkDone(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  // Reset edit state pri prepnutí mesiaca
  useEffect(() => {
    setEditingId(null);
    setAdding(false);
    setTitle("");
    setNote("");
    setOpenCommentsId(null);
  }, [monthKey]);

  // Zoznam riadkov + completed mapovanie
  const rows: Row[] = useMemo(() => {
    const src = hasSnapshot ? snapWorks : tplWorks;
    return src.map((w) => ({
      id: w.id,
      title: w.title,
      note: w.note,
      position: w.position,
      assignee_id: (w as { assignee_id?: string | null }).assignee_id ?? null,
    }));
  }, [hasSnapshot, snapWorks, tplWorks]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const handleAssign = async (row: Row, newAssigneeId: string | null) => {
    if (row.assignee_id === newAssigneeId) return;
    try {
      // Materializuje snapshot a uloží assignee pre tento mesiac.
      await updateSnap.mutateAsync({ id: row.id, patch: { assignee_id: newAssigneeId } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa priradiť");
    }
  };

  const doneSet = useMemo(() => {
    if (hasSnapshot) {
      return new Set(snapCompletions.map((c) => c.monthly_work_id));
    }
    return new Set(tplCompletions.filter((c) => c.month_key === monthKey).map((c) => c.work_id));
  }, [hasSnapshot, snapCompletions, tplCompletions, monthKey]);

  const total = rows.length;
  const doneCount = rows.filter((r) => doneSet.has(r.id)).length;

  const isLoading = tplLoading || snapLoading;

  const submitAdd = async () => {
    if (!title.trim()) return;
    try {
      await createSnap.mutateAsync({
        title: title.trim(),
        note: note.trim() || null,
        position: rows.length,
      });
      setTitle("");
      setNote("");
      setAdding(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa pridať");
    }
  };

  const startEdit = (row: Row) => {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditNote(row.note ?? "");
  };

  const submitEdit = async () => {
    if (!editingId || !editTitle.trim()) return;
    try {
      await updateSnap.mutateAsync({ id: editingId, patch: { title: editTitle.trim(), note: editNote.trim() || null } });
      setEditingId(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa uložiť");
    }
  };

  const handleDelete = async (row: Row) => {
    const ok = confirm(`Odstrániť "${row.title}" z tohto mesiaca?`);
    if (!ok) return;
    try {
      await deleteSnap.mutateAsync(row.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa odstrániť");
    }
  };

  const handleToggle = async (row: Row) => {
    if (!userId) return;
    if (hasSnapshot) {
      toggleSnap.mutate({ monthly_work_id: row.id, user_id: userId, done: !doneSet.has(row.id) });
    } else {
      // Šablónový režim — používame staré completions
      toggleTpl.mutate({ work_id: row.id, month_key: monthKey, user_id: userId, done: !doneSet.has(row.id) });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = rows.map((r) => r.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    reorderSnap.mutate(next.map((r, i) => ({ id: r.id, position: i })));
  };

  const onWorkClick = (name: string) => {
    setTaskTitle(name);
    setTaskOpen(true);
  };

  const handleReset = async () => {
    if (!confirm(`Vrátiť mesiac „${formatMonthLabel(monthKey)}" na šablónu? Mesačné úpravy sa stratia.`)) return;
    try {
      await resetSnap.mutateAsync();
      toast.success("Mesiac obnovený zo šablóny");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa resetovať");
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!confirm("Uložiť aktuálny mesiac ako novú šablónu pre budúce mesiace? Existujúce mesiace zostanú nedotknuté.")) return;
    try {
      await saveTpl.mutateAsync();
      toast.success("Šablóna aktualizovaná");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nepodarilo sa uložiť");
    }
  };

  return (
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck2 className="h-4 w-4" /> Náplň predplatného
        </h2>
        <div className="flex items-center gap-1">
          {!adding && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Pridať
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleReset}
                disabled={!hasSnapshot || resetSnap.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Vrátiť mesiac na šablónu
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSaveAsTemplate}
                    disabled={!hasSnapshot || saveTpl.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" /> Uložiť ako novú šablónu
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Month switcher */}
      <div className="mb-2 flex items-center justify-between rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Predchádzajúci mesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-semibold capitalize">
          {formatMonthLabel(monthKey)}
          {total > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              · {doneCount}/{total} hotových
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Nasledujúci mesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            hasSnapshot
              ? "bg-primary/10 text-primary"
              : "bg-surface-muted text-muted-foreground"
          )}
          title={hasSnapshot
            ? "Tento mesiac má vlastné úpravy. Šablóna je nedotknutá."
            : "Mesiac používa default šablónu. Prvá úprava ju oddelí pre tento mesiac."
          }
        >
          {hasSnapshot ? "Upravené pre tento mesiac" : "Šablóna"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Klik názov → úloha
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Načítavam...</p>
      ) : rows.length === 0 && !adding ? (
        <p className="rounded-xl bg-surface-muted p-4 text-center text-xs text-muted-foreground">
          Zatiaľ žiadne práce. Klikni „Pridať".
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {rows.map((r) =>
                editingId === r.id ? (
                  <li key={r.id} className="space-y-2 rounded-xl border border-primary/40 bg-surface-muted/60 p-3">
                    <Input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      placeholder="Názov"
                    />
                    <Textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                      placeholder="Poznámka (voliteľné)"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="mr-1 h-3.5 w-3.5" /> Zrušiť
                      </Button>
                      <Button size="sm" onClick={submitEdit} disabled={!editTitle.trim() || updateSnap.isPending}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Uložiť
                      </Button>
                    </div>
                  </li>
                ) : (
                  <Fragment key={r.id}>
                    <SortableRow
                      row={r}
                      done={doneSet.has(r.id)}
                      editable={hasSnapshot}
                      onToggle={() => handleToggle(r)}
                      onOpenTask={() => onWorkClick(r.title)}
                      onDelete={() => handleDelete(r)}
                      onEdit={() => startEdit(r)}
                      onAssign={(uid) => handleAssign(r, uid)}
                      onToggleComments={() =>
                        setOpenCommentsId((cur) => (cur === r.id ? null : r.id))
                      }
                      commentCount={commentsByWork.get(r.id)?.length ?? 0}
                      commentsOpen={openCommentsId === r.id}
                      assignee={r.assignee_id ? profileById.get(r.assignee_id) ?? null : null}
                      profiles={profiles}
                      toggleDisabled={!userId || toggleSnap.isPending || toggleTpl.isPending}
                    />
                    {openCommentsId === r.id && (
                      <MonthlyWorkCommentsPanel
                        key={`${r.id}-comments`}
                        projectId={projectId}
                        monthKey={monthKey}
                        workId={r.id}
                        comments={commentsByWork.get(r.id) ?? []}
                        onClose={() => setOpenCommentsId(null)}
                      />
                    )}
                  </Fragment>
                )
              )}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {!hasSnapshot && rows.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-muted/40 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">
            Tento mesiac kopíruje šablónu. Pre úpravy ho oddeľ.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={ensureSnap.isPending}
            onClick={() => ensureSnap.mutate()}
          >
            <Pencil className="h-3 w-3" /> Upraviť tento mesiac
          </Button>
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface-muted/60 p-3">
          <div className="space-y-1">
            <Label htmlFor="rw-title" className="text-xs">Názov práce</Label>
            <Input
              id="rw-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="napr. 8 príspevkov na FB, 1 newsletter…"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAdd();
                if (e.key === "Escape") { setAdding(false); setTitle(""); setNote(""); }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rw-note" className="text-xs">Poznámka (voliteľné)</Label>
            <Textarea
              id="rw-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Detail / rozsah"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTitle(""); setNote(""); }}>
              Zrušiť
            </Button>
            <Button size="sm" onClick={submitAdd} disabled={!title.trim() || createSnap.isPending}>
              {createSnap.isPending ? "Pridávam..." : "Pridať"}
            </Button>
          </div>
        </div>
      )}

      <NewTaskDialog
        hideTrigger
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultProjectId={projectId}
        defaultTitle={taskTitle}
      />
    </div>
  );
}