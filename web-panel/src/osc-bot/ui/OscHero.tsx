import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';

import { cn } from '@/shared/lib/ui';
import { useNow } from '@/shared/lib/use-now';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Switch } from '@/shared/ui/Switch';
import { formatDuration } from '../../../protocol/chatbox-template';
import { EOscBotState, type OscBotConfig, type OscBotStatus } from '../../../protocol/osc';
import { EOscPreset } from '../model/use-osc-studio';
import { STATE_LABELS } from './labels';
import { TrafficSparkline } from './TrafficSparkline';

type OscHeroProps = {
    config: OscBotConfig;
    status: OscBotStatus;
    customizing: boolean;
    onToggleEnabled: (enabled: boolean) => void;
    onApplyPreset: (preset: EOscPreset) => void;
    onToggleCustomizing: () => void;
    onResetStats: () => void;
};

const STATE_TONE: Record<EOscBotState, string> = {
    [EOscBotState.Disabled]: 'text-(--deck-fg-4)',
    [EOscBotState.Starting]: 'text-amber-300',
    [EOscBotState.Listening]: 'text-(--deck-accent)',
    [EOscBotState.SendOnly]: 'text-amber-300',
    [EOscBotState.Error]: 'text-red-300',
};

export const OscHero = ({
    config,
    status,
    customizing,
    onToggleEnabled,
    onApplyPreset,
    onToggleCustomizing,
    onResetStats,
}: OscHeroProps) => {
    const { _ } = useLingui();
    const enabled = config.enabled;
    const live = status.state === EOscBotState.Listening || status.state === EOscBotState.SendOnly;
    const now = useNow(1000, live);
    const startedAt = status.startedAt ? Date.parse(status.startedAt) : Number.NaN;
    const uptime = Number.isFinite(startedAt)
        ? formatDuration((now.getTime() - startedAt) / 1000)
        : '—';
    const address =
        status.listenAddress ?? `${config.allowLan ? '0.0.0.0' : '127.0.0.1'}:${config.listenPort}`;

    return (
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(140deg,color-mix(in_oklab,var(--deck-accent)_14%,rgba(18,21,29,.92)),rgba(12,14,20,.9)_55%)] p-4 shadow-[0_24px_60px_-28px_color-mix(in_oklab,var(--deck-accent)_45%,transparent),inset_0_1px_0_rgba(255,255,255,.07)]">
            <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--deck-accent)_22%,transparent),transparent_65%)]" />
            <div className="relative flex items-center gap-3.5">
                <StatusOrb
                    state={status.state}
                    packetsIn={status.packetsIn}
                    packetsOut={status.packetsOut}
                />
                <div className="min-w-0 flex-1">
                    <div className="font-mono text-[9.5px] font-bold tracking-[0.18em] text-(--deck-fg-4)">
                        WAND · OSC BOT
                    </div>
                    <h2
                        className={cn(
                            'mt-0.5 text-[17px] font-bold leading-tight',
                            STATE_TONE[status.state],
                        )}
                    >
                        {_(STATE_LABELS[status.state])}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-(--deck-fg-3)">
                        {enabled ? (
                            <Trans>UDP {address}</Trans>
                        ) : (
                            <Trans>VRChat chatbox · avatar parameters · OSC controllers</Trans>
                        )}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <IconButton
                        icon="layout"
                        label={customizing ? _(msg`Finish customizing`) : _(msg`Customize layout`)}
                        active={customizing}
                        onClick={onToggleCustomizing}
                    />
                    <Switch
                        checked={enabled}
                        label={enabled ? _(msg`Turn the OSC bot off`) : _(msg`Turn the OSC bot on`)}
                        onChange={onToggleEnabled}
                    />
                </div>
            </div>

            {status.error ? (
                <div className="relative mt-3 flex items-start gap-2 rounded-[10px] border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
                    <Icon className="mt-0.5 size-3.5 shrink-0" name="alert" />
                    <span>{status.error}</span>
                </div>
            ) : null}

            {enabled ? (
                <>
                    <div className="relative mt-3.5 grid grid-cols-4 gap-1.5">
                        <Stat label={_(msg`In`)} value={status.packetsIn} tone="accent" />
                        <Stat label={_(msg`Out`)} value={status.packetsOut} tone="violet" />
                        <Stat
                            label={_(msg`Errors`)}
                            value={status.errors}
                            tone={status.errors ? 'red' : 'muted'}
                        />
                        <Stat label={_(msg`Uptime`)} value={uptime} tone="muted" />
                    </div>
                    <div className="relative mt-2.5">
                        <TrafficSparkline
                            history={status.history}
                            action={
                                <button
                                    type="button"
                                    className="rounded-[5px] px-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-(--deck-fg-4) underline-offset-2 hover:text-(--deck-fg-2) hover:underline"
                                    onClick={onResetStats}
                                >
                                    <Trans>Reset</Trans>
                                </button>
                            }
                        />
                    </div>
                </>
            ) : (
                <div className="relative mt-3.5">
                    <p className="text-[12.5px] leading-relaxed text-(--deck-fg-2)">
                        <Trans>
                            Show what you are playing in VRChat's chatbox and drive mods from avatar
                            parameters, TouchOSC, Stream Deck or any OSC app.
                        </Trans>
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <PresetButton
                            icon="message"
                            title={_(msg`VRChat`)}
                            detail={_(msg`Chatbox + avatar · 9001 → 9000`)}
                            primary
                            onClick={() => onApplyPreset(EOscPreset.Vrchat)}
                        />
                        <PresetButton
                            icon="network"
                            title={_(msg`LAN controller`)}
                            detail={_(msg`TouchOSC & co · port 8000`)}
                            onClick={() => onApplyPreset(EOscPreset.Lan)}
                        />
                    </div>
                </div>
            )}
        </section>
    );
};

type StatusOrbProps = {
    state: EOscBotState;
    packetsIn: number;
    packetsOut: number;
};

const StatusOrb = ({ state, packetsIn, packetsOut }: StatusOrbProps) => {
    const listening = state === EOscBotState.Listening;
    const sending = listening || state === EOscBotState.SendOnly;

    return (
        <div className="relative size-14 shrink-0">
            {listening ? (
                <span className="osc-orb-ring absolute -inset-1 rounded-full motion-reduce:animate-none" />
            ) : null}
            {/* Remounting on every count change replays the ripple: one pulse per batch of traffic. */}
            {listening && packetsIn > 0 ? (
                <span
                    key={`in-${packetsIn}`}
                    className="absolute inset-0 rounded-full border-2 border-(--deck-accent) opacity-0 motion-safe:animate-[osc-ripple_900ms_ease-out]"
                />
            ) : null}
            {sending && packetsOut > 0 ? (
                <span
                    key={`out-${packetsOut}`}
                    className="absolute inset-0 rounded-full border-2 border-violet-400 opacity-0 motion-safe:animate-[osc-ripple_1100ms_ease-out]"
                />
            ) : null}
            <span
                className={cn(
                    'absolute inset-0 flex items-center justify-center rounded-full border transition-colors duration-500',
                    listening
                        ? 'border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklab,var(--deck-accent)_45%,transparent),rgba(10,12,18,.9)_70%)] text-(--deck-accent) shadow-[0_0_28px_-4px_var(--deck-accent)]'
                        : state === EOscBotState.Disabled
                          ? 'border-white/10 bg-white/4 text-(--deck-fg-4)'
                          : state === EOscBotState.Error
                            ? 'border-red-400/40 bg-red-500/10 text-red-300'
                            : 'border-amber-300/40 bg-amber-400/10 text-amber-300',
                )}
            >
                <Icon className="size-6" name="broadcast" stroke={1.7} />
            </span>
        </div>
    );
};

const STAT_TONES = {
    accent: 'text-(--deck-accent)',
    violet: 'text-violet-300',
    red: 'text-red-300',
    muted: 'text-(--deck-fg)',
} as const;

const Stat = ({
    label,
    value,
    tone,
}: {
    label: string;
    value: number | string;
    tone: keyof typeof STAT_TONES;
}) => {
    return (
        <div className="rounded-[10px] border border-white/8 bg-black/20 px-2 py-1.5">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-(--deck-fg-4)">
                {label}
            </div>
            <div
                key={String(value)}
                className={cn(
                    'mt-0.5 truncate font-mono text-[14px] font-bold tabular-nums motion-safe:animate-[osc-rise_220ms_ease-out]',
                    STAT_TONES[tone],
                )}
            >
                {typeof value === 'number' ? compactNumber(value) : value}
            </div>
        </div>
    );
};

type PresetButtonProps = {
    icon: 'message' | 'network';
    title: string;
    detail: string;
    primary?: boolean;
    onClick: () => void;
};

const PresetButton = ({ icon, title, detail, primary = false, onClick }: PresetButtonProps) => {
    return (
        <button
            type="button"
            className={cn(
                'group flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-transform active:scale-[0.98]',
                primary
                    ? 'border-[color-mix(in_oklab,var(--deck-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] shadow-[0_10px_30px_-14px_var(--deck-accent)]'
                    : 'border-white/10 bg-white/4 hover:bg-white/6',
            )}
            onClick={onClick}
        >
            <span
                className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-[9px]',
                    primary ? 'bg-(--deck-accent) text-black' : 'bg-white/8 text-(--deck-fg-2)',
                )}
            >
                <Icon className="size-4" name={icon} stroke={2} />
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-(--deck-fg)">
                    {title}
                </span>
                <span className="block truncate font-mono text-[10px] text-(--deck-fg-3)">
                    {detail}
                </span>
            </span>
        </button>
    );
};

function compactNumber(value: number): string {
    if (value < 10000) return value.toLocaleString('en-US');
    if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
    return `${(value / 1_000_000).toFixed(1)}M`;
}
