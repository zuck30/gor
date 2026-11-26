/**
 * The triumphs are the game's awards: small, persistent goals that teach the
 * rules while you play. They live in localStorage, so a reload remembers them.
 */

export interface Triumph {
  id: string;
  name: string;
  desc: string;
}

export const TRIUMPHS: Triumph[] = [
  { id: "firstBlood", name: "First Blood", desc: "Land your first kill." },
  { id: "slayer", name: "Slayer", desc: "Kill 10 foes." },
  { id: "godslayer", name: "Godslayer", desc: "Fell a god." },
  { id: "giantsBane", name: "Giant's Bane", desc: "Fell a troll." },
  { id: "colossus", name: "Colossus Felled", desc: "Fell a colossus." },
  { id: "rage", name: "Rage Unleashed", desc: "Unleash the rage." },
  { id: "stormwalker", name: "Stormwalker", desc: "Survive 10 seconds outside the ring." },
  { id: "unbroken", name: "Unbroken", desc: "Reach wave 5 without dying." },
  { id: "godofrage", name: "The God of Rage", desc: "Reach 50 kills." },
];

const STORAGE_KEY = "godOfRageTriumphs";

export class TriumphBoard {
  private readonly earned = new Set<string>();

  constructor(private readonly onEarn: (triumph: Triumph) => void) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids: unknown = JSON.parse(raw);
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (typeof id === "string") { this.earned.add(id); }
          }
        }
      }
    } catch {
      // A private window or a broken value simply starts a fresh board.
    }
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  count(): number {
    return this.earned.size;
  }

  award(id: string): Triumph | null {
    if (this.earned.has(id)) {
      return null;
    }
    const triumph = TRIUMPHS.find((entry) => entry.id === id);
    if (!triumph) {
      return null;
    }
    this.earned.add(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.earned]));
    } catch {
      // Persistence is a bonus, not a requirement.
    }
    this.onEarn(triumph);
    return triumph;
  }
}
