import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, FolderKanban } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { CalendarWidget } from "@/components/CalendarWidget";
import { SubscriptionPendingBadge } from "@/components/SubscriptionPendingBadge";
import { useCurrentUserId, useProfiles, useProjects } from "@/lib/queries";

export default function Dashboard() {
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useProfiles();
  const currentUserId = useCurrentUserId();
  const me = profiles.find((p) => p.id === currentUserId);

  return (
    <div className="page-container">
      <header className="flex items-center justify-between md:hidden">
        <div>
          <p className="text-sm text-muted-foreground">Dobrý deň</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {me?.full_name?.trim() || "Tím"}
          </h1>
        </div>
        <Link to="/me"><UserAvatar profile={me} size="lg" /></Link>
      </header>
      <header className="hidden md:flex md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Dobrý deň</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {me?.full_name?.trim() || "Tím"}
          </h1>
        </div>
      </header>

      <section className="mt-6 md:mt-8">
        <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4" /> Kalendár
        </h2>
        <CalendarWidget mode="personal" />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold">
            <FolderKanban className="h-4 w-4" /> Projekty
          </h2>
          <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Všetky <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-2xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne projekty. Vytvor prvý v sekcii Projekty.
          </p>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-4 xl:grid-cols-5">
            {projects.map((p) => {
              const color = p.color ?? "#3b82f6";
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="group relative isolate min-w-[200px] flex-shrink-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-transparent hover:shadow-xl md:min-w-0"
                >
                  {/* gradient glow accent */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-1"
                    style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
                  />

                  <div className="relative flex items-start justify-between gap-2">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold uppercase text-white shadow-sm"
                      style={{ backgroundColor: color }}
                    >
                      {p.name.trim().charAt(0) || "•"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <SubscriptionPendingBadge projectId={p.id} />
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </div>

                  <h3 className="relative mt-3 line-clamp-2 text-sm font-semibold leading-snug">
                    {p.name}
                  </h3>
                  {p.category && (
                    <p className="relative mt-1 text-[11px] text-muted-foreground">{p.category}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
