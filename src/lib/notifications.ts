import { isTauri } from "./api";

let webPerm: NotificationPermission | null = null;

async function ensureWebPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (webPerm === "granted" || Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  webPerm = p;
  return p === "granted";
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (isTauri()) {
      const mod = await import("@tauri-apps/plugin-notification");
      let granted = await mod.isPermissionGranted();
      if (!granted) granted = (await mod.requestPermission()) === "granted";
      return granted;
    }
    return await ensureWebPermission();
  } catch (e) {
    console.error("notification permission failed", e);
    return false;
  }
}

export async function notify(title: string, body?: string): Promise<void> {
  try {
    if (isTauri()) {
      const mod = await import("@tauri-apps/plugin-notification");
      if (!(await mod.isPermissionGranted())) {
        const granted = (await mod.requestPermission()) === "granted";
        if (!granted) return;
      }
      mod.sendNotification({ title, body });
      return;
    }
    if (await ensureWebPermission()) {
      new Notification(title, { body });
    }
  } catch (e) {
    console.error("notification failed", e);
  }
}
