import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';

const COLLAPSE_MS = 320;

type StudioSectionProps = {
    id: string;
    title: string;
    subtitle: string;
    icon: IconName;
    badge?: ReactNode;
    collapsed: boolean;
    hidden: boolean;
    /** Layout editing: shows reorder and visibility controls instead of the content toggle. */
    customizing: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    actions?: ReactNode;
    children: ReactNode;
    onToggleCollapsed: () => void;
    onMove: (direction: -1 | 1) => void;
    onToggleHidden: () => void;
};

export const StudioSection = ({
    id,
    title,
    subtitle,
    icon,
    badge,
    collapsed,
    hidden,
    customizing,
    canMoveUp,
    canMoveDown,
    actions,
    children,
    onToggleCollapsed,
    onMove,
    onToggleHidden,
}: StudioSectionProps) => {
    const { _ } = useLingui();
    const panelId = `studio-panel-${id}`;
    const open = !collapsed && !customizing;
    // Collapsed bodies (the live monitor, the ticking preview) stop rendering once the
    // collapse animation has finished, so traffic updates only cost what is on screen.
    const [bodyMounted, setBodyMounted] = useState(open);

    useEffect(() => {
        if (open) {
            setBodyMounted(true);
            return;
        }
        const timer = window.setTimeout(() => setBodyMounted(false), COLLAPSE_MS);
        return () => window.clearTimeout(timer);
    }, [open]);

    return (
        <section
            id={`studio-${id}`}
            className={cn(
                'mb-3 break-inside-avoid overflow-hidden rounded-[16px] border bg-white/3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl transition-[opacity,border-color] duration-300',
                customizing
                    ? 'border-dashed border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)]'
                    : 'border-white/10',
                hidden && 'opacity-45',
            )}
        >
            <div className="flex items-center gap-2.5 px-3.5 py-3">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    disabled={customizing}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                    onClick={onToggleCollapsed}
                >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-[color-mix(in_oklab,var(--deck-accent)_24%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_8%,transparent)] text-(--deck-accent)">
                        <Icon className="size-4" name={icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-(--deck-fg)">
                                {title}
                            </span>
                            {badge}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-(--deck-fg-4)">
                            {subtitle}
                        </span>
                    </span>
                    {customizing ? null : (
                        <Icon
                            className={cn(
                                'size-4 shrink-0 text-(--deck-fg-3) transition-transform duration-300',
                                open ? 'rotate-0' : '-rotate-90',
                            )}
                            name="chevron-down"
                        />
                    )}
                </button>
                {customizing ? (
                    <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                            size="sm"
                            icon="arrow-up"
                            label={_(msg`Move ${title} up`)}
                            disabled={!canMoveUp}
                            onClick={() => onMove(-1)}
                        />
                        <IconButton
                            size="sm"
                            icon="arrow-down"
                            label={_(msg`Move ${title} down`)}
                            disabled={!canMoveDown}
                            onClick={() => onMove(1)}
                        />
                        <IconButton
                            size="sm"
                            icon={hidden ? 'eye-off' : 'eye'}
                            label={hidden ? _(msg`Show ${title}`) : _(msg`Hide ${title}`)}
                            active={!hidden}
                            onClick={onToggleHidden}
                        />
                    </div>
                ) : (
                    actions
                )}
            </div>
            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    {open || bodyMounted ? (
                        <div className="border-t border-white/6 px-3.5 pb-3.5 pt-3">{children}</div>
                    ) : null}
                </div>
            </div>
        </section>
    );
};

type SettingRowProps = {
    title: string;
    description?: string;
    children: ReactNode;
};

/** A labelled setting with its control on the right. */
export const SettingRow = ({ title, description, children }: SettingRowProps) => {
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-(--deck-fg)">{title}</div>
                {description ? (
                    <div className="mt-0.5 text-[11.5px] leading-snug text-(--deck-fg-3)">
                        {description}
                    </div>
                ) : null}
            </div>
            <div className="flex shrink-0 items-center">{children}</div>
        </div>
    );
};

export const Eyebrow = ({ children }: { children: ReactNode }) => {
    return (
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">
            {children}
        </div>
    );
};

type RangeFieldProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
};

export const RangeField = ({
    label,
    value,
    min,
    max,
    step = 1,
    format,
    onChange,
}: RangeFieldProps) => {
    const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;

    return (
        <label className="block py-2">
            <span className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-(--deck-fg)">{label}</span>
                <span className="rounded-[6px] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-(--deck-accent)">
                    {format(value)}
                </span>
            </span>
            <input
                type="range"
                className="osc-range w-full"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ '--fill': `${fill}%` } as Record<string, string>}
                onInput={(event) => onChange(Number(event.currentTarget.value))}
            />
        </label>
    );
};
