import { loadJson, saveJson } from '../shared/storage';

export const DEFAULT_ACCENT_COLOR = '#00ffd5';

const ACCENT_COLOR_STORAGE_KEY = 'wand-remote.accent-color.v1';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function applySavedAccentColor(): string {
    return applyAccentColor(loadAccentColor());
}

export function loadAccentColor(): string {
    return loadJson<string>(ACCENT_COLOR_STORAGE_KEY, reviveAccentColor, DEFAULT_ACCENT_COLOR);
}

export function setAccentColor(value: string): string {
    const nextColor = normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
    applyAccentColor(nextColor);
    saveJson(
        ACCENT_COLOR_STORAGE_KEY,
        nextColor,
        (storedValue) => storedValue === DEFAULT_ACCENT_COLOR,
    );
    return nextColor;
}

function applyAccentColor(value: string): string {
    if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--deck-accent', value);
    }

    return value;
}

function reviveAccentColor(raw: unknown): string | null {
    return normalizeAccentColor(raw);
}

function normalizeAccentColor(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedValue = value.trim().toLowerCase();
    return HEX_COLOR_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

// ---- Layout & theme preferences --------------------------------------------------------------
// Per-device and applied to <html> as data attributes / CSS variables (see index.css), so no
// component has to know about them. String values are persisted: keep the right-hand side.

export enum ETheme {
    Midnight = 'midnight',
    Oled = 'oled',
    Nebula = 'nebula',
    Slate = 'slate',
}

export enum EDensity {
    Compact = 'compact',
    Cozy = 'cozy',
    Roomy = 'roomy',
}

export enum ELayoutWidth {
    /** One centered column, comfortable on desktops and tablets. */
    Focus = 'focus',
    /** Edge to edge: mods and studio sections flow into columns. */
    Wide = 'wide',
}

export type AppearancePrefs = {
    theme: ETheme;
    density: EDensity;
    layout: ELayoutWidth;
    /** UI zoom, 0.85–1.25. */
    scale: number;
    /** Ambient accent glow, 0–1. */
    glow: number;
    reduceMotion: boolean;
};

export const DEFAULT_APPEARANCE: AppearancePrefs = {
    theme: ETheme.Midnight,
    density: EDensity.Cozy,
    layout: ELayoutWidth.Focus,
    scale: 1,
    glow: 1,
    reduceMotion: false,
};

export const UI_SCALES = [0.9, 1, 1.1, 1.2] as const;

const APPEARANCE_STORAGE_KEY = 'wand-remote.appearance.v1';

export function loadAppearance(): AppearancePrefs {
    return loadJson(APPEARANCE_STORAGE_KEY, reviveAppearance, DEFAULT_APPEARANCE);
}

export function saveAppearance(prefs: AppearancePrefs): AppearancePrefs {
    applyAppearance(prefs);
    saveJson(
        APPEARANCE_STORAGE_KEY,
        prefs,
        () => JSON.stringify(prefs) === JSON.stringify(DEFAULT_APPEARANCE),
    );
    return prefs;
}

export function applySavedAppearance(): AppearancePrefs {
    const prefs = loadAppearance();
    applyAppearance(prefs);
    return prefs;
}

function applyAppearance(prefs: AppearancePrefs): void {
    if (typeof document === 'undefined') {
        return;
    }
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.density = prefs.density;
    root.dataset.layout = prefs.layout;
    root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full';
    root.style.setProperty('--deck-zoom', String(prefs.scale));
    root.style.setProperty('--deck-glow', String(prefs.glow));
}

function reviveAppearance(raw: unknown): AppearancePrefs | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const value = raw as Record<string, unknown>;
    const pick = <T extends string>(
        options: Record<string, T>,
        candidate: unknown,
        fallback: T,
    ): T => (Object.values(options).includes(candidate as T) ? (candidate as T) : fallback);
    const number = (candidate: unknown, min: number, max: number, fallback: number) =>
        typeof candidate === 'number' && Number.isFinite(candidate)
            ? Math.min(max, Math.max(min, candidate))
            : fallback;

    return {
        theme: pick(ETheme, value.theme, DEFAULT_APPEARANCE.theme),
        density: pick(EDensity, value.density, DEFAULT_APPEARANCE.density),
        layout: pick(ELayoutWidth, value.layout, DEFAULT_APPEARANCE.layout),
        scale: number(value.scale, 0.85, 1.25, DEFAULT_APPEARANCE.scale),
        glow: number(value.glow, 0, 1, DEFAULT_APPEARANCE.glow),
        reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : false,
    };
}
