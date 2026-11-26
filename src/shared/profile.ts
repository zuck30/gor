import type { GameMode } from "./modes.js";

export interface PlayerProfile {
  name: string;
  color: string;
  /** Chosen on the profile screen. Old saved profiles default to co-op. */
  mode: GameMode;
}

/** The eight warrior colours available before a hunt. */
export const PLAYER_COLORS = [
  { name: "Crimson", value: "#b83a32" },
  { name: "Storm Blue", value: "#3a78c2" },
  { name: "Gold", value: "#d6b84a" },
  { name: "Emerald", value: "#3f9a5a" },
  { name: "Violet", value: "#8256c9" },
  { name: "Ash", value: "#8a8f96" },
  { name: "Teal", value: "#2f9a9a" },
  { name: "Ember", value: "#d06a2a" },
] as const;

export const PROFILE_STORAGE_KEY = "godOfRageProfile";

/** Trim, remove control characters, and cap the public name. */
export function sanitizeName(value: unknown): string {
  if (typeof value !== "string") { return ""; }
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16);
}

/** Only one of the palette colours is accepted. */
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") { return null; }
  const match = PLAYER_COLORS.find(
    (entry) => entry.value.toLowerCase() === value.toLowerCase()
  );
  return match ? match.value : null;
}
