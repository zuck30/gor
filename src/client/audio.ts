/**
 * The voice pack. Files live in `public/voices/` and are looked up by name.
 * Missing files are skipped silently, so the game ships fine before the pack
 * arrives - and the subtitles still land.
 *
 * Missing files stay silent, so the game still runs before the pack arrives.
 */
export const VOICE_LINES = {
  intro: {
    file: "storm-intro.mp3",
    text: "The God of Rage.",
    volume: 0.85,
  },
  matchStart: {
    file: "storm-match-start.mp3",
    text: "The gods have sent their children to die.",
    volume: 0.8,
  },
  phase1: {
    file: "storm-phase-1.mp3",
    text: "The storm is closing. Good.",
    volume: 0.8,
  },
  phase2: {
    file: "storm-phase-2.mp3",
    text: "They are watching. Let them.",
    volume: 0.8,
  },
  phase3: {
    file: "storm-phase-3.mp3",
    text: "There is less world now. Less to hide behind.",
    volume: 0.8,
  },
  phase4: {
    file: "storm-phase-4.mp3",
    text: "The last circle. The last god.",
    volume: 0.85,
  },
  final: {
    file: "storm-final.mp3",
    text: "Nowhere left to run. Only thunder.",
    volume: 0.85,
  },
  outside: {
    file: "storm-outside.mp3",
    text: "The storm feeds on you. Move.",
    volume: 0.8,
  },
  lowHealth: {
    file: "storm-low-health.mp3",
    text: "Your blood is loud. It calls them.",
    volume: 0.8,
  },
  kill: {
    file: "storm-kill.mp3",
    text: "Die.",
    volume: 0.85,
  },
  wave: {
    file: "storm-wave.mp3",
    text: "They come again.",
    volume: 0.8,
  },
  boss: {
    file: "storm-boss.mp3",
    text: "A colossus. Finally, a fight.",
    volume: 0.9,
  },
  rage: {
    file: "rage.mp3",
    text: "Rage.",
    volume: 1.0,
  },
  revive: {
    file: "storm-revive.mp3",
    text: "The storm is not done with you.",
    volume: 0.8,
  },
  eliminated: {
    file: "storm-eliminated.mp3",
    text: "One more name for the storm.",
    volume: 0.75,
  },
  victory: {
    file: "storm-victory.mp3",
    text: "The storm is yours. The gods are silent.",
    volume: 0.9,
  },
  defeat: {
    file: "storm-defeat.mp3",
    text: "You fall. The gods laugh.",
    volume: 0.85,
  },
  drop: {
    file: "storm-drop.mp3",
    text: "Drop.",
    volume: 0.85,
  },
  hit1: {
    file: "survivor-hit-01.mp3",
    text: "",
    volume: 0.5,
  },
  hit2: {
    file: "survivor-hit-02.mp3",
    text: "",
    volume: 0.5,
  },
  survivorDeath: {
    file: "survivor-death.mp3",
    text: "",
    volume: 0.7,
  },
  countTen: {
    file: "herald-count-ten.mp3",
    text: "Ten seconds.",
    volume: 0.65,
  },
  finalRing: {
    file: "herald-final-ring.mp3",
    text: "Final ring.",
    volume: 0.7,
  },
  zoneSealed: {
    file: "herald-zone-sealed.mp3",
    text: "The arena is sealed.",
    volume: 0.65,
  },
} as const;

export type VoiceKey = keyof typeof VOICE_LINES;

/** Bump when a take is replaced so the browser does not serve a cached mp3. */
const AUDIO_VERSION = "2";

export const SFX = {
  sword: { file: "sword-sound.mp3", volume: 0.55, voices: 2 },
  cry: { file: "enemy-cry.mp3", volume: 0.45, voices: 4 },
  gone: { file: "enemy-gone.mp3", volume: 0.55, voices: 3 },
} as const;

export type SfxKey = keyof typeof SFX;

export class VoicePlayer {
  private enabled = true;
  private unlocked = false;
  private userChose = false;
  private pending: VoiceKey | null = null;
  private readonly elements = new Map<VoiceKey, HTMLAudioElement>();
  private readonly missing = new Set<VoiceKey>();
  private readonly sfxPools = new Map<SfxKey, {
    elements: HTMLAudioElement[];
    cursor: number;
    missing: boolean;
  }>();
  private readonly subtitles: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private subtitleTimer = 0;

  constructor() {
    this.subtitles = document.getElementById("voice-line") as HTMLDivElement;
    this.toggle = document.getElementById("sound-toggle") as HTMLButtonElement;

    this.toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.userChose) {
        this.userChose = true;
        this.enabled = true;
        this.unlock();
        return;
      }
      this.enabled = !this.enabled;
      this.updateToggle();
    });

    const unlock = () => this.unlock();
    addEventListener("keydown", unlock, { once: true });
    addEventListener("pointerdown", unlock, { once: true });
    this.updateToggle();
  }

  private unlock() {
    if (this.unlocked) {
      return;
    }
    this.unlocked = true;
    this.updateToggle();
    if (this.pending) {
      const key = this.pending;
      this.pending = null;
      this.play(key);
    }
  }

  private updateToggle() {
    this.toggle.classList.toggle("is-muted", !this.enabled);
    this.toggle.setAttribute("aria-label", this.enabled ? "Sound on" : "Sound off");
    this.toggle.title = this.enabled ? "Sound on" : "Sound off";
  }

  playSfx(key: SfxKey) {
    if (!this.enabled || !this.unlocked) {
      return;
    }

    const definition = SFX[key];
    let pool = this.sfxPools.get(key);
    if (!pool) {
      const elements: HTMLAudioElement[] = [];
      const created = { elements, cursor: 0, missing: false };
      for (let i = 0; i < definition.voices; i++) {
        const audio = new Audio(`/voices/${definition.file}?v=${AUDIO_VERSION}`);
        audio.preload = "auto";
        audio.addEventListener("error", () => { created.missing = true; }, { once: true });
        elements.push(audio);
      }
      this.sfxPools.set(key, created);
      pool = created;
    }

    if (pool.missing || pool.elements.length === 0) {
      return;
    }

    const audio = pool.elements[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.elements.length;
    audio.volume = definition.volume * (0.9 + Math.random() * 0.2);
    audio.playbackRate = 0.95 + Math.random() * 0.1;
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // A browser that refuses audio simply stays silent.
    }
  }

  private element(key: VoiceKey): HTMLAudioElement | null {
    if (this.missing.has(key)) {
      return null;
    }
    let audio = this.elements.get(key);
    if (!audio) {
      const line = VOICE_LINES[key];
      audio = new Audio(`/voices/${line.file}?v=${AUDIO_VERSION}`);
      audio.preload = "auto";
      audio.addEventListener("error", () => this.missing.add(key), { once: true });
      this.elements.set(key, audio);
    }
    return audio;
  }

  private showSubtitle(text: string) {
    this.subtitles.textContent = text;
    this.subtitles.classList.add("is-visible");
    window.clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => {
      this.subtitles.classList.remove("is-visible");
    }, 4200);
  }

  play(key: VoiceKey) {
    const line = VOICE_LINES[key];
    if (line.text) {
      this.showSubtitle(line.text);
    }

    if (!this.enabled) {
      return;
    }
    if (!this.unlocked) {
      this.pending = key;
      return;
    }

    const audio = this.element(key);
    if (!audio) {
      return;
    }

    audio.volume = line.volume;
    audio.currentTime = 0;
    const started = audio.play();
    if (started) {
      started.catch(() => {
        if (!this.unlocked) {
          this.pending = key;
        }
      });
    }
  }
}
