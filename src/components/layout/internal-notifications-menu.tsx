"use client";

import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Download,
  Inbox,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  getBrowserNotificationPermission,
  getInternalBrowserNotificationDecision,
  INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY,
  INTERNAL_BROWSER_NOTIFICATIONS_LAST_SEEN_KEY,
} from "@/lib/internal-notifications/browser-notifications";
import {
  getInternalNotificationDtoDownloadHref,
  type InternalNotificationDto,
} from "@/lib/internal-notifications/presentation";
import { cn } from "@/lib/utils/cn";

type InternalNotificationsResponse = {
  notifications?: InternalNotificationDto[];
  unread_count?: number;
};

type InternalNotificationsSummaryResponse = {
  unread_count?: number;
  active_count?: number;
  latest_notification?: InternalNotificationDto | null;
};

const severityTone = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-700",
} satisfies Record<InternalNotificationDto["severity"], string>;

const severityLabel = {
  info: "Informação",
  success: "Concluído",
  warning: "Atenção",
  error: "Falha",
} satisfies Record<InternalNotificationDto["severity"], string>;

type BrowserNotificationPermission = NotificationPermission | "unsupported";

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getUnreadLabel(unreadCount: number) {
  if (unreadCount === 0) {
    return "Abrir notificações internas";
  }

  if (unreadCount === 1) {
    return "Abrir notificações internas, 1 não lida";
  }

  return `Abrir notificações internas, ${unreadCount} não lidas`;
}

export function InternalNotificationsMenu() {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSeenNotificationIdRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [notifications, setNotifications] = useState<InternalNotificationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<BrowserNotificationPermission>("unsupported");
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [browserNotificationMessage, setBrowserNotificationMessage] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/internal-notifications/summary", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("summary_failed");
      }

      const payload = (await response.json()) as InternalNotificationsSummaryResponse;
      setUnreadCount(payload.unread_count ?? 0);
      setActiveCount(payload.active_count ?? 0);
      setError(null);

      const latestNotification = payload.latest_notification ?? null;
      const decision = getInternalBrowserNotificationDecision({
        latestNotification,
        lastSeenId: lastSeenNotificationIdRef.current,
        enabled: browserNotificationsEnabled,
        permission: browserNotificationPermission,
        pageVisible: document.visibilityState === "visible" && document.hasFocus(),
      });

      if (decision.nextLastSeenId) {
        lastSeenNotificationIdRef.current = decision.nextLastSeenId;
        window.localStorage.setItem(INTERNAL_BROWSER_NOTIFICATIONS_LAST_SEEN_KEY, decision.nextLastSeenId);
      }

      if (decision.action === "show" && "Notification" in window) {
        const notification = new window.Notification(decision.title, {
          body: decision.body,
          tag: decision.tag,
        });

        notification.onclick = () => {
          window.focus();
          window.location.assign(decision.href);
          notification.close();
        };
      }
    } catch {
      setError("Não foi possível carregar as notificações internas.");
    } finally {
      setLoadingSummary(false);
    }
  }, [browserNotificationPermission, browserNotificationsEnabled]);

  const loadNotifications = useCallback(async () => {
    setLoadingList(true);

    try {
      const response = await fetch("/api/internal-notifications?state=active&pageSize=6", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("list_failed");
      }

      const payload = (await response.json()) as InternalNotificationsResponse;
      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unread_count ?? 0);
      setError(null);
    } catch {
      setError("Não foi possível carregar a lista de notificações.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const initializeBrowserNotificationsId = window.setTimeout(() => {
      setBrowserNotificationPermission(getBrowserNotificationPermission());
      setBrowserNotificationsEnabled(
        window.localStorage.getItem(INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY) === "true",
      );
      lastSeenNotificationIdRef.current = window.localStorage.getItem(INTERNAL_BROWSER_NOTIFICATIONS_LAST_SEEN_KEY);
    }, 0);

    return () => window.clearTimeout(initializeBrowserNotificationsId);
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadSummary();
    }, 0);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" || browserNotificationsEnabled) {
        void loadSummary();
      }
    }, 60_000);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadSummary();
      }
    }

    function onManualRefresh() {
      void loadSummary();

      if (open) {
        void loadNotifications();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("fasa:internal-notifications:refresh", onManualRefresh);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("fasa:internal-notifications:refresh", onManualRefresh);
    };
  }, [browserNotificationsEnabled, loadNotifications, loadSummary, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const openLoadId = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(openLoadId);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [loadNotifications, open]);

  async function updateNotificationState(notificationId: string, action: "read" | "dismiss") {
    setActionId(`${action}:${notificationId}`);

    try {
      const response = await fetch(`/api/internal-notifications/${notificationId}/${action}`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("action_failed");
      }

      setLiveMessage(action === "read" ? "Notificação marcada como lida." : "Notificação dispensada.");
      await Promise.all([loadSummary(), loadNotifications()]);
    } catch {
      setError(
        action === "read"
          ? "Não foi possível marcar a notificação como lida."
          : "Não foi possível dispensar a notificação.",
      );
    } finally {
      setActionId(null);
    }
  }

  async function enableBrowserNotifications() {
    setBrowserNotificationMessage("");

    if (!("Notification" in window)) {
      setBrowserNotificationPermission("unsupported");
      setBrowserNotificationsEnabled(false);
      setBrowserNotificationMessage("Pop-ups indisponíveis neste navegador.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setBrowserNotificationPermission(permission);

    if (permission === "granted") {
      window.localStorage.setItem(INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY, "true");
      setBrowserNotificationsEnabled(true);
      setBrowserNotificationMessage("Pop-ups ativados.");
      void loadSummary();
      return;
    }

    window.localStorage.removeItem(INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY);
    setBrowserNotificationsEnabled(false);
    setBrowserNotificationMessage(
      permission === "denied" ? "Pop-ups bloqueados no navegador." : "Pop-ups não ativados.",
    );
  }

  function disableBrowserNotifications() {
    window.localStorage.removeItem(INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY);
    setBrowserNotificationsEnabled(false);
    setBrowserNotificationMessage("Pop-ups desativados.");
  }

  const browserNotificationButtonLabel =
    browserNotificationPermission === "unsupported"
      ? "Pop-ups indisponíveis"
      : browserNotificationPermission === "denied"
        ? "Pop-ups bloqueados"
        : browserNotificationsEnabled && browserNotificationPermission === "granted"
          ? "Desativar pop-ups"
          : "Ativar pop-ups";
  const browserNotificationButtonDisabled =
    browserNotificationPermission === "unsupported" || browserNotificationPermission === "denied";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-950/5 outline-none transition hover:border-blue-200 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
          open && "border-blue-200 text-blue-700 ring-1 ring-blue-100",
        )}
        aria-label={getUnreadLabel(unreadCount)}
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificações internas"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {loadingSummary ? (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
        ) : unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notificações internas"
          className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">Notificações internas</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
                  : `${activeCount} ${activeCount === 1 ? "ativa" : "ativas"}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                aria-label="Atualizar notificações"
                disabled={loadingList}
                onClick={() => {
                  void Promise.all([loadSummary(), loadNotifications()]);
                }}
              >
                <RefreshCw aria-hidden="true" className={cn("h-4 w-4", loadingList && "animate-spin")} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                aria-label="Fechar notificações"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {liveMessage}
          </p>

          {error ? (
            <div className="mx-3 mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="max-h-[min(32rem,calc(100vh-5.5rem))] overflow-y-auto p-3">
            {loadingList ? (
              <div className="grid gap-2" aria-label="Carregando notificações">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="h-3 w-28 rounded-full bg-slate-200" />
                    <div className="mt-3 h-4 w-4/5 rounded-full bg-slate-200" />
                    <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <Inbox aria-hidden="true" className="h-6 w-6 text-slate-400" />
                <p className="mt-3 text-sm font-semibold text-slate-950">Nenhuma notificação interna</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Atualizações de certificados aparecerão aqui.
                </p>
              </div>
            ) : (
              <ul className="grid gap-2">
                {notifications.map((notification) => {
                  const actionSuffix = notification.id;
                  const reading = actionId === `read:${actionSuffix}`;
                  const dismissing = actionId === `dismiss:${actionSuffix}`;
                  const downloadHref = getInternalNotificationDtoDownloadHref(notification);

                  return (
                    <li
                      key={notification.id}
                      className={cn(
                        "rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:bg-blue-50/30",
                        !notification.isRead && "border-blue-200 bg-blue-50/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              severityTone[notification.severity],
                            )}
                          >
                            {severityLabel[notification.severity]}
                          </span>
                          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
                            {notification.title}
                          </p>
                        </div>
                        {!notification.isRead ? (
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" aria-label="Não lida" />
                        ) : null}
                      </div>

                      {notification.body ? (
                        <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-slate-600">{notification.body}</p>
                      ) : null}

                      <p className="mt-2 text-xs text-slate-500">{formatNotificationTime(notification.createdAt)}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {notification.href ? (
                          <Link
                            href={notification.href}
                            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            onClick={() => setOpen(false)}
                          >
                            Ver certificado
                          </Link>
                        ) : null}
                        {downloadHref ? (
                          <a
                            href={downloadHref}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm shadow-blue-600/15 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            onClick={() => setOpen(false)}
                          >
                            <Download aria-hidden="true" className="h-3.5 w-3.5" />
                            {notification.downloadLabel ?? "Baixar certificado"}
                          </a>
                        ) : null}
                        {!notification.isRead ? (
                          <button
                            type="button"
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
                            disabled={Boolean(actionId)}
                            onClick={() => void updateNotificationState(notification.id, "read")}
                          >
                            {reading ? (
                              <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                            Marcar lida
                          </button>
                        ) : (
                          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-green-700">
                            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                            Lida
                          </span>
                        )}
                        <button
                          type="button"
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
                          disabled={Boolean(actionId)}
                          onClick={() => void updateNotificationState(notification.id, "dismiss")}
                        >
                          {dismissing ? (
                            <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                          )}
                          Dispensar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="grid gap-2 border-t border-slate-100 bg-slate-50 px-3 py-3">
            <button
              type="button"
              className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={browserNotificationButtonDisabled}
              onClick={() => {
                if (browserNotificationsEnabled && browserNotificationPermission === "granted") {
                  disableBrowserNotifications();
                  return;
                }

                void enableBrowserNotifications();
              }}
            >
              {browserNotificationButtonLabel}
            </button>
            {browserNotificationMessage ? (
              <p className="text-center text-xs text-slate-500" role="status" aria-live="polite">
                {browserNotificationMessage}
              </p>
            ) : null}
            <Link
              href="/notificacoes-internas"
              className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              onClick={() => setOpen(false)}
            >
              Ver central completa
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
