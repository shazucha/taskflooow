import { useMemo } from "react";
import { Check, Lock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  useAddProjectMember,
  useProfiles,
  useProjectMembers,
  useRemoveProjectMember,
} from "@/lib/queries";
import type { Profile, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
}

export function ProjectAccessCard({ project }: Props) {
  const { data: profiles = [] } = useProfiles();
  const { data: members = [] } = useProjectMembers(project.id);
  const addMember = useAddProjectMember(project.id);
  const removeMember = useRemoveProjectMember(project.id);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const ownerId = project.owner_id;
  const autoAccess = project.category === "odstartujto.sk";

  const sorted = useMemo(
    () =>
      [...profiles].sort((a, b) =>
        (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "")
      ),
    [profiles]
  );

  const toggle = (p: Profile) => {
    if (p.id === ownerId) return;
    if (memberIds.has(p.id)) {
      removeMember.mutate(p.id);
    } else {
      addMember.mutate(p.id);
    }
  };

  return (
    <div className="card-elevated p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Kto má prístup</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {autoAccess
          ? "Tento projekt je v kategórii odstartujto.sk — vidia ho všetci automaticky."
          : "Vyber, kto z tímu môže vidieť tento projekt. Vlastník a ty (admin) máte prístup vždy."}
      </p>

      <div className="mt-3 space-y-1.5">
        {sorted.map((p) => {
          const isOwner = p.id === ownerId;
          const hasAccess = isOwner || memberIds.has(p.id) || autoAccess;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              disabled={isOwner || autoAccess}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition",
                hasAccess
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card hover:bg-surface-muted",
                (isOwner || autoAccess) && "cursor-not-allowed opacity-80"
              )}
            >
              <UserAvatar profile={p} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.full_name ?? p.email ?? "—"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {isOwner ? "Vlastník" : autoAccess ? "Automatický prístup" : p.email}
                </div>
              </div>
              {hasAccess ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {!autoAccess && (
        <p className="mt-3 text-xs text-muted-foreground">
          Aktuálne má prístup: <strong>{memberIds.size}</strong>{" "}
          {memberIds.size === 1 ? "člen" : "členovia"}.
        </p>
      )}
    </div>
  );
}
