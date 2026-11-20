/** Whether this browser is set to show a notification when grading finishes (Account > Notifications). */
export function browserNotifyOn(): boolean {
  try {
    return localStorage.getItem("jg-browser-notify") === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
}
