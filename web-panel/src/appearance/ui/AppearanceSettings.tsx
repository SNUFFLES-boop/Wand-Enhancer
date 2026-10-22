import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import {
    type AppearancePrefs,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_APPEARANCE,
    EDensity,
    ELayoutWidth,
    ETheme,
    loadAccentColor,
    loadAppearance,
    saveAppearance,
    setAccentColor,
    UI_SCALES,
} from '../appearance-storage';

const ACCENT_OPTIONS: { value: string; label: MessageDescriptor; swatchClass: string }[] = [
    { value: '#3B82F6', label: msg`Cobalt`, swatchClass: 'bg-[#3B82F6]' },
    { value: DEFAULT_ACCENT_COLOR, label: msg`Cyan`, swatchClass: 'bg-[#00FFD5]' },
    { value: '#FF2E63', label: msg`Crimson`, swatchClass: 'bg-[#FF2E63]' },
    { value: '#A78BFA', label: msg`Violet`, swatchClass: 'bg-[#A78BFA]' },
    { value: '#7CFF5B', label: msg`Lime`, swatchClass: 'bg-[#7CFF5B]' },
    { value: '#FFB12E', label: msg`Amber`, swatchClass: 'bg-[#FFB12E]' },
    { value: '#ee00ff', label: msg`Magenta`, swatchClass: 'bg-[#ee00ff]' },
];

const THEME_OPTIONS: { value: ETheme; label: MessageDescriptor; preview: string }[] = [
    {
        value: ETheme.Midnight,
        label: msg`Midnight`,
        preview: 'bg-[linear-gradient(160deg,#141821,#07080b)]',
    },
    { value: ETheme.Oled, label: msg`OLED`, preview: 'bg-black' },
    {
        value: ETheme.Nebula,
        label: msg`Nebula`,
        preview:
            'bg-[radial-gradient(circle_at_80%_10%,rgba(236,72,153,.45),transparent_55%),radial-gradient(circle_at_10%_90%,rgba(99,102,241,.5),transparent_60%),#0b0817]',
    },
    {
        value: ETheme.Slate,
        label: msg`Slate`,
        preview: 'bg-[linear-gradient(160deg,#243041,#121822)]',
    },
];

/** Theme, accent and layout preferences for this device. */
export const AppearanceSettings = () => {
    const { _ } = useLingui();
    const [prefs, setPrefs] = useState(loadAppearance);
    const change = (patch: Partial<AppearancePrefs>) =>
        setPrefs(saveAppearance({ ...prefs, ...patch }));
    const isDefault = JSON.stringify(prefs) === JSON.stringify(DEFAULT_APPEARANCE);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1.5">
                {THEME_OPTIONS.map((theme) => {
                    const active = prefs.theme === theme.value;
                    return (
                        <button
                            key={theme.value}
                            type="button"
                            aria-pressed={active}
                            className={cn(
                                'group flex flex-col gap-1.5 rounded-[11px] border p-1.5 text-[11px] font-semibold transition-all',
                                active
                                    ? 'border-(--deck-accent) text-(--deck-fg) shadow-[0_0_18px_-8px_var(--deck-accent)]'
                                    : 'border-white/10 text-(--deck-fg-3) hover:border-white/20',
                            )}
                            onClick={() => change({ theme: theme.value })}
                        >
                            <span
                                className={cn(
                                    'relative block h-11 w-full overflow-hidden rounded-[7px] border border-white/10',
                                    theme.preview,
                                )}
                            >
                                <span className="absolute left-1.5 right-4 top-1.5 h-1 rounded-full bg-white/25" />
                                <span className="absolute left-1.5 right-6 top-3.5 h-1 rounded-full bg-white/12" />
                                <span className="absolute bottom-1.5 right-1.5 h-2.5 w-4.5 rounded-full bg-(--deck-accent)" />
                            </span>
                            {_(theme.label)}
                        </button>
                    );
                })}
            </div>

            <AccentPicker />

            <div className="space-y-2">
                <ControlLabel icon="layout" label={_(msg`Layout`)} />
                <Segmented
                    label={_(msg`Layout`)}
                    value={prefs.layout}
                    options={[
                        { value: ELayoutWidth.Focus, label: _(msg`Focused`) },
                        { value: ELayoutWidth.Wide, label: _(msg`Wide columns`) },
                    ]}
                    onChange={(layout) => change({ layout })}
                />
                <ControlLabel icon="sliders" label={_(msg`Density`)} />
                <Segmented
                    label={_(msg`Density`)}
                    value={prefs.density}
                    options={[
                        { value: EDensity.Compact, label: _(msg`Compact`) },
                        { value: EDensity.Cozy, label: _(msg`Cozy`) },
                        { value: EDensity.Roomy, label: _(msg`Roomy`) },
                    ]}
                    onChange={(density) => change({ density })}
                />
                <ControlLabel icon="search" label={_(msg`UI size`)} />
                <Segmented
                    label={_(msg`UI size`)}
                    value={String(prefs.scale)}
                    options={UI_SCALES.map((scale) => ({
                        value: String(scale),
                        label: `${Math.round(scale * 100)}%`,
                    }))}
                    onChange={(scale) => change({ scale: Number(scale) })}
                />
            </div>

            <label className="remote-glass-control block rounded-[10px] border px-3 py-2.5">
                <span className="mb-2 flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-(--deck-fg)">
                        <Trans>Ambient glow</Trans>
                    </span>
                    <span className="font-mono text-[11px] text-(--deck-fg-3)">
                        {Math.round(prefs.glow * 100)}%
                    </span>
                </span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(prefs.glow * 100)}
                    aria-label={_(msg`Ambient glow`)}
                    className="osc-range w-full"
                    style={
                        { '--fill': `${Math.round(prefs.glow * 100)}%` } as Record<string, string>
                    }
                    onInput={(event) => change({ glow: Number(event.currentTarget.value) / 100 })}
                />
            </label>

            <div className="remote-glass-control flex items-center gap-3 rounded-[10px] border px-3 py-2.5">
                <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-(--deck-fg)">
                        <Trans>Reduce motion</Trans>
                    </span>
                    <span className="block text-[11px] text-(--deck-fg-3)">
                        <Trans>Skips ripples, slides and pulses.</Trans>
                    </span>
                </span>
                <Switch
                    checked={prefs.reduceMotion}
                    label={_(msg`Reduce motion`)}
                    onChange={(reduceMotion) => change({ reduceMotion })}
                />
            </div>

            {isDefault ? null : (
                <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 rounded-[10px] py-2 text-[12px] font-semibold text-(--deck-fg-3) hover:bg-white/5 hover:text-(--deck-fg)"
                    onClick={() => setPrefs(saveAppearance(DEFAULT_APPEARANCE))}
                >
                    <Icon className="size-3.5" name="refresh" />
                    <Trans>Reset layout & theme</Trans>
                </button>
            )}
        </div>
    );
};

const ControlLabel = ({
    icon,
    label,
}: {
    icon: 'layout' | 'sliders' | 'search';
    label: string;
}) => {
    return (
        <div className="flex items-center gap-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-(--deck-fg-4)">
            <Icon className="size-3" name={icon} />
            {label}
        </div>
    );
};

const AccentPicker = () => {
    const { _ } = useLingui();
    const [current, setCurrent] = useState(loadAccentColor);

    const applyAccent = (value: string) => {
        setCurrent(setAccentColor(value));
    };

    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
                {ACCENT_OPTIONS.map((option) => {
                    const active = current.toLowerCase() === option.value.toLowerCase();
                    return (
                        <button
                            key={option.value}
                            type="button"
                            className={cn(
                                'remote-glass-control flex items-center gap-1.5 rounded-[9px] border px-2 py-2 text-[12px] font-medium',
                                active
                                    ? 'border-(--deck-accent) text-(--deck-fg)'
                                    : 'text-(--deck-fg-3)',
                            )}
                            onClick={() => applyAccent(option.value)}
                        >
                            <span
                                className={cn(
                                    'size-3.5 shrink-0 rounded-lg border border-white/10',
                                    option.swatchClass,
                                )}
                            />
                            {_(option.label)}
                        </button>
                    );
                })}
            </div>
            <label className="remote-glass-control flex h-9.5 items-center gap-2 rounded-[9px] border px-2.5">
                <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-(--deck-fg-3)">
                    <Trans>Custom</Trans>
                </span>
                <span className="font-mono text-[11px] text-(--deck-fg-4)">{current}</span>
                <input
                    type="color"
                    value={current}
                    className="size-5 rounded border-0 bg-transparent p-0"
                    onChange={(event) => applyAccent(event.currentTarget.value)}
                />
            </label>
        </div>
    );
};
