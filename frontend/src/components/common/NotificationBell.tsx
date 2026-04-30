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

  // Polled bell — 30s is the same cadence used elsewhere in the app.
  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list(false),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationsApi.markRead(n.id);
        refresh();
      } catch {
        // non-fatal — still navigate
      }
    }
    if (n.link) navigate(n.link);
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
    <Popover>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
