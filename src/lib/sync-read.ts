// Utilities for SyncRead session/user identity (anonymous, localStorage-based).

const USER_ID_KEY = "syncread_user_id";
const USER_NAME_KEY = "syncread_user_name";

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getUserName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(USER_NAME_KEY) ?? "";
}

export function setUserName(name: string) {
  localStorage.setItem(USER_NAME_KEY, name);
}

export function generateSessionCode(): string {
  // 6-character uppercase alphanumeric
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
