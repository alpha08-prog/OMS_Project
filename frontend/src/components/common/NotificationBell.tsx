import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { notificationsApi, type Notification } from "@/lib/api";

/**
 * Resolve the route to open for a notification. We re-derive the link from
 * the notification's `type` + `referenceId` rather than blindly trusting the
 * `link` column, because older rows in Catalyst were written with stale
 * paths (e.g. `/admin/news`, `/admin/tasks`) that no longer route to a
 * real page and silently fall through to the catch-all. Doing the dispatch
 * client-side means existing rows keep working without a backfill.
 */
function resolveNotificationLink(n: Notification): string | null {
  const id = n.referenceId ?? null;
  switch (n.type) {
    case "GRIEVANCE_REJECTED":
    case "TEMPLE_VISIT_LETTER_GENERATED":
      return id
        ? `/grievances/view?id=${encodeURIComponent(id)}`
        : "/grievances/view";
    case "TASK_ASSIGNED":
      return id
        ? `/staff/tasks?id=${encodeURIComponent(id)}`
        : "/staff/tasks";
    case "TASK_RESOLVED":
      return id
        ? `/admin/task-tracker?id=${encodeURIComponent(id)}`
        : "/admin/task-tracker";
    case "NEWS_CRITICAL":
      return id ? `/news/view?id=${encodeURIComponent(id)}` : "/news/view";
    case "TOUR_DECIDED":
      return id ? `/staff/home?tour=${encodeURIComponent(id)}` : "/staff/home";
    default:
      // Future notification types — fall back to whatever the server stored.
      return n.link ?? null;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Controlled so handleClick can close the popover after navigation —
  // otherwise the floating panel stays open over the new page until the
  // user clicks outside.
  const [open, setOpen] = useState(false);

  // Polled bell — 30s is the same cadence used elsewhere in the app.
  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // First page only. Older pages are appended into `older` on demand — keeping
  // them out of the query cache means the 30s poll refreshes the newest page
  // without discarding what the user has already loaded.
  const { data: firstPage, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.listPage(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const [older, setOlder] = useState<Notification[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // Cursor for the NEXT fetch: the tail of whatever is currently on screen.
  const [cursor, setCursor] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // A refetch of page 1 invalidates every cursor derived from the old page, so
  // drop the appended tail rather than splice a stale cursor onto fresh rows.
  useEffect(() => {
    setOlder([]);
    setCursor(firstPage?.nextCursor ?? null);
    setExhausted(!firstPage?.hasMore);
  }, [firstPage]);

  // De-duplicate defensively: a notification created between two fetches can
  // shift the page boundary, and rendering the same id twice would throw a
  // duplicate-key warning and show the entry twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...(firstPage?.items ?? []), ...older].filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [firstPage, older]);

  const loadOlder = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await notificationsApi.listPage({ cursor });
      setOlder((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      if (!page.hasMore || !page.nextCursor) setExhausted(true);
    } catch {
      // Leave what is already loaded on screen; the button stays available.
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = () => {
    setOlder([]);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleClick = async (n: Notification) => {
    // Close the popover immediately so the user sees the page change. The
    // mark-read network call still runs in the background.
    setOpen(false);
    if (!n.isRead) {
      try {
        await notificationsApi.markRead(n.id);
        refresh();
      } catch {
        // non-fatal — still navigate
      }
    }
    const target = resolveNotificationLink(n);
    if (target) navigate(target);
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      refresh();
    } catch {
      // ignore
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-indigo-700" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {items.some((n) => !n.isRead) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAll}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/60 ${
                n.isRead ? "" : "bg-indigo-50/40"
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && (
                  <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  {n.body && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {n.body}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
                {n.isRead && (
                  <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </div>
            </button>
          ))}

          {/*
            Without this, the dropdown showed only the newest page and there was
            no way to reach anything older — the rows existed, counted toward the
            badge, and could never be opened or marked read.
          */}
          {!isLoading && items.length > 0 && !exhausted && (
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingMore}
              className="w-full px-3 py-2.5 text-xs text-indigo-700 hover:bg-muted/60 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load older notifications"}
            </button>
          )}
          {!isLoading && items.length > 0 && exhausted && (
            <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
              That's everything.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
