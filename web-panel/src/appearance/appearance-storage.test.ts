import { afterEach, describe, expect, it } from 'vitest';

import {
    applySavedAppearance,
    DEFAULT_APPEARANCE,
    EDensity,
    ELayoutWidth,
    ETheme,
    loadAppearance,
    saveAppearance,
} from './appearance-storage';

const KEY = 'wand-remote.appearance.v1';

describe('appearance preferences', () => {
    afterEach(() => localStorage.clear());

    it('applies preferences to the root element and persists them', () => {
        saveAppearance({
            ...DEFAULT_APPEARANCE,
            theme: ETheme.Oled,
            density: EDensity.Compact,
            layout: ELayoutWidth.Wide,
            scale: 1.2,
            glow: 0.25,
            reduceMotion: true,
        });

        const root = document.documentElement;
        expect(root.dataset.theme).toBe('oled');
        expect(root.dataset.density).toBe('compact');
        expect(root.dataset.layout).toBe('wide');
        expect(root.dataset.motion).toBe('reduced');
        expect(root.style.getPropertyValue('--deck-zoom')).toBe('1.2');
        expect(loadAppearance().theme).toBe(ETheme.Oled);
    });

    it('does not store the defaults and repairs tampered values', () => {
        saveAppearance(DEFAULT_APPEARANCE);
        expect(localStorage.getItem(KEY)).toBeNull();

        localStorage.setItem(
            KEY,
            JSON.stringify({
                theme: 'neon',
                density: 'roomy',
                scale: 9,
                glow: -1,
                reduceMotion: 'yes',
            }),
        );
        expect(applySavedAppearance()).toEqual({
            ...DEFAULT_APPEARANCE,
            density: EDensity.Roomy,
            scale: 1.25,
            glow: 0,
        });
    });
});
