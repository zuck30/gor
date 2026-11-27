/** Chat is short, per-room, and never trusted from the client. */
export const CHAT_MAX_LENGTH = 140;
export const CHAT_COOLDOWN_MS = 600;

/** What the server broadcasts for a chat line. */
export interface ChatMessage {
  sessionId: string;
  name: string;
  color: string;
  text: string;
}

/** Trim, collapse whitespace, strip control characters, and cap the line. */
export function sanitizeChat(value: unknown): string {
  if (typeof value !== "string") { return ""; }
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}
