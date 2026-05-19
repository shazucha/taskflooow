// Facebook-style "upozornenia" — zvonček s dropdown zoznamom správ.
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Users, FolderKanban, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotificationsFeed, type NotificationItem } from "@/lib/useNotificationsFeed";
import { useState } from "react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "teraz";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("sk-SK");
}

function IconFor({ kind }: { kind: NotificationItem["kind"] }) {
  if (kind === "dm") return <MessageCircle className="h-4 w-4" />;
  if (kind === "team-chat") return <Users className="h-4 w-4" />;
  return <FolderKanban className="h-4 w-4" />;
}

export function NotificationsBell({ className }: { className?: string }) {
  const { items, total, markAllRead, markItemRead } = useNotificationsFeed();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Upozornenia"
          title="Upozornenia"
          className={cn(
            "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/70 text-foreground transition hover:bg-surface-muted",
            className
          )}
        >
          <Bell className="h-5 w-5" strokeWidth={2.2} />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">Upozornenia</p>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Označiť všetko
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Žiadne nové upozornenia</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Keď ti niekto napíše, objaví sa to tu.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <ul className="divide-y divide-border/60">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await markItemRead(it);
                      navigate(it.url);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-muted"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <IconFor kind={it.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{it.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(it.time)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {it.preview}
                      </span>
                      {it.count > 1 && (
                        <span className="mt-1 inline-block rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          {it.count} nových
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="border-t border-border/60 px-4 py-2 text-center">
          <Link
            to="/chat"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Otvoriť chat
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}