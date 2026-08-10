import type { InternalNotificationDto } from "@/lib/internal-notifications/presentation";

export const INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY = "fasa.internalNotifications.browser.enabled";
export const INTERNAL_BROWSER_NOTIFICATIONS_LAST_SEEN_KEY = "fasa.internalNotifications.browser.lastSeenId";
export const INTERNAL_BROWSER_NOTIFICATION_FALLBACK_HREF = "/notificacoes-internas";

type BrowserNotificationPermission = NotificationPermission | "unsupported";

type BrowserNotificationDecisionInput = {
  latestNotification: InternalNotificationDto | null;
  lastSeenId: string | null;
  enabled: boolean;
  permission: BrowserNotificationPermission;
  pageVisible: boolean;
};

type BrowserNotificationIgnoreDecision = {
  action: "ignore";
  nextLastSeenId?: string;
};

type BrowserNotificationShowDecision = {
  action: "show";
  nextLastSeenId: string;
  title: string;
  body: string;
  href: string;
  tag: string;
};

export type BrowserNotificationDecision = BrowserNotificationIgnoreDecision | BrowserNotificationShowDecision;

export function canUseBrowserNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!canUseBrowserNotifications()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function getInternalBrowserNotificationDecision({
  latestNotification,
  lastSeenId,
  enabled,
  permission,
  pageVisible,
}: BrowserNotificationDecisionInput): BrowserNotificationDecision {
  if (!latestNotification) {
    return { action: "ignore" };
  }

  if (latestNotification.id === lastSeenId) {
    return { action: "ignore" };
  }

  const nextLastSeenId = latestNotification.id;

  if (!lastSeenId || !enabled || permission !== "granted" || pageVisible) {
    return { action: "ignore", nextLastSeenId };
  }

  return {
    action: "show",
    nextLastSeenId,
    title: latestNotification.title,
    body: latestNotification.body ?? "Abra a central interna para revisar.",
    href: latestNotification.href ?? INTERNAL_BROWSER_NOTIFICATION_FALLBACK_HREF,
    tag: `fasa-internal-notification-${latestNotification.id}`,
  };
}
