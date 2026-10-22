import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { EConnectionStatus } from '@/remote-session/remote-session.reducer';

import { cn } from '@/shared/lib/ui';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { EOscBotState } from '../../../protocol/osc';
import { EPanelView } from '../use-remote-panel';

type FloatingDockProps = {
    status: EConnectionStatus;
    view: EPanelView;
    oscState: EOscBotState | null;
    hidden: boolean;
    leftHasBadge: boolean;
    rightHasBadge: boolean;
    onOpenSettings: () => void;
    onOpenLibrary: () => void;
    onViewChange: (view: EPanelView) => void;
};

export const FloatingDock = ({
    status,
    view,
    oscState,
    hidden,
    leftHasBadge,
    rightHasBadge,
    onOpenSettings,
    onOpenLibrary,
    onViewChange,
}: FloatingDockProps) => {
    const { _ } = useLingui();
    const live = status === EConnectionStatus.Connected;
    const oscLive = oscState === EOscBotState.Listening || oscState === EOscBotState.SendOnly;
    const oscWarning = oscState === EOscBotState.SendOnly || oscState === EOscBotState.Error;
    const oscIndex = view === EPanelView.Osc ? 1 : 0;

    return (
        <div
            className={cn(
                'deck-scale absolute bottom-4.5 left-1/2 z-10 flex w-max -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#0e1016]/80 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl transition duration-300',
                hidden ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100',
            )}
        >
            <DockButton
                badge={leftHasBadge}
                icon="settings"
                label={_(msg`Settings`)}
                onClick={onOpenSettings}
            />
            <div
                role="tablist"
                aria-label={_(msg`View`)}
                className="relative grid h-9.5 grid-cols-2 items-stretch rounded-full border border-white/8 bg-white/3 p-0.5"
            >
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-[color-mix(in_oklab,var(--deck-accent)_18%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--deck-accent)_45%,transparent),0_0_18px_-6px_var(--deck-accent)] transition-transform duration-300 ease-out motion-reduce:transition-none"
                    style={{ transform: `translateX(${oscIndex * 100}%)` }}
                />
                <ViewTab
                    active={view === EPanelView.Mods}
                    icon="gamepad"
                    label={_(msg`Mods`)}
                    dot={live ? 'live' : null}
                    onClick={() => onViewChange(EPanelView.Mods)}
                />
                <ViewTab
                    active={view === EPanelView.Osc}
                    icon="broadcast"
                    label={_(msg`OSC`)}
                    dot={oscWarning ? 'warn' : oscLive ? 'live' : null}
                    onClick={() => onViewChange(EPanelView.Osc)}
                />
            </div>
            <DockButton
                badge={rightHasBadge}
                icon="list"
                label={_(msg`Library`)}
                onClick={onOpenLibrary}
            />
        </div>
    );
};

type ViewTabProps = {
    active: boolean;
    icon: IconName;
    label: string;
    dot: 'live' | 'warn' | null;
    onClick: () => void;
};

const ViewTab = ({ active, icon, label, dot, onClick }: ViewTabProps) => {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
                'relative z-10 flex min-w-19 items-center justify-center gap-1.5 rounded-full px-3 text-[11.5px] font-semibold transition-colors',
                active ? 'text-(--deck-fg)' : 'text-(--deck-fg-3) hover:text-(--deck-fg-2)',
            )}
            onClick={onClick}
        >
            <Icon
                className={cn('size-4 shrink-0', active && 'text-(--deck-accent)')}
                name={icon}
                stroke={1.8}
            />
            {label}
            {dot ? (
                <span
                    className={cn(
                        'size-1.5 rounded-full',
                        dot === 'live'
                            ? 'bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)] motion-safe:animate-[breathe_2s_ease-in-out_infinite]'
                            : 'bg-amber-300 shadow-[0_0_6px_#fcd34d]',
                    )}
                />
            ) : null}
        </button>
    );
};

type DockButtonProps = {
    badge: boolean;
    icon: IconName;
    label: string;
    onClick: () => void;
};

const DockButton = ({ badge, icon, label, onClick }: DockButtonProps) => {
    return (
        <button
            type="button"
            aria-label={label}
            className="relative flex h-9.5 w-11 items-center justify-center rounded-full text-(--deck-fg) hover:bg-white/6"
            onClick={onClick}
        >
            <Icon className="size-4.5" name={icon} stroke={1.7} />
            {badge ? (
                <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_4px_var(--deck-accent)]" />
            ) : null}
        </button>
    );
};
