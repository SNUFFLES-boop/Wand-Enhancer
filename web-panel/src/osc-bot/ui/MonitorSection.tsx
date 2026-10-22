import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { type FormEvent, useMemo, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { Segmented } from '@/shared/ui/Segmented';
import {
    EOscDirection,
    isValidOscAddress,
    type OscActivityEntry,
    type OscArgPreview,
    type OscTarget,
} from '../../../protocol/osc';
import { formatOscArg } from '../model/osc-args';
import type { OscStudioModel } from '../model/use-osc-studio';
import { isVrchatNoise } from '../model/vrchat-noise';

enum EMonitorFilter {
    All = 'all',
    In = 'in',
    Out = 'out',
    Problems = 'problems',
}

const VISIBLE_ROWS = 150;

type MonitorSectionProps = {
    activity: OscActivityEntry[];
    targets: OscTarget[];
    running: boolean;
    monitor: OscStudioModel['monitor'];
    onBind: (entry: OscActivityEntry) => void;
};

export const MonitorSection = ({
    activity,
    targets,
    running,
    monitor,
    onBind,
}: MonitorSectionProps) => {
    const { _ } = useLingui();
    const [filter, setFilter] = useState(EMonitorFilter.All);
    const [hideNoise, setHideNoise] = useState(true);
    const [pausedAt, setPausedAt] = useState<number | null>(null);
    const [clearedBefore, setClearedBefore] = useState(0);

    const rows = useMemo(() => {
        const matches = activity.filter((entry) => {
            if (entry.id <= clearedBefore) return false;
            if (pausedAt !== null && entry.id > pausedAt) return false;
            if (hideNoise && isVrchatNoise(entry.address)) return false;
            if (filter === EMonitorFilter.In) return entry.direction === EOscDirection.In;
            if (filter === EMonitorFilter.Out) return entry.direction === EOscDirection.Out;
            if (filter === EMonitorFilter.Problems)
                return entry.direction === EOscDirection.Error || entry.failed;
            return true;
        });
        return matches.slice(-VISIBLE_ROWS).reverse();
    }, [activity, clearedBefore, filter, hideNoise, pausedAt]);

    const latestId = activity[activity.length - 1]?.id ?? 0;
    const hiddenSincePause =
        pausedAt === null ? 0 : activity.filter((entry) => entry.id > pausedAt).length;

    return (
        <div className="space-y-3">
            <Segmented
                size="sm"
                label={_(msg`Filter traffic`)}
                value={filter}
                options={[
                    { value: EMonitorFilter.All, label: _(msg`All`) },
                    { value: EMonitorFilter.In, label: _(msg`In`), icon: 'arrow-down' },
                    { value: EMonitorFilter.Out, label: _(msg`Out`), icon: 'arrow-up' },
                    { value: EMonitorFilter.Problems, label: _(msg`Issues`), icon: 'alert' },
                ]}
                onChange={setFilter}
            />
            <div className="flex flex-wrap items-center gap-1.5">
                <ToolbarChip
                    active={hideNoise}
                    icon="eye-off"
                    label={_(msg`Hide VRChat built-ins`)}
                    onClick={() => setHideNoise((value) => !value)}
                />
                <ToolbarChip
                    active={pausedAt !== null}
                    icon={pausedAt !== null ? 'play' : 'pause'}
                    label={
                        pausedAt !== null ? _(msg`Resume (${hiddenSincePause} new)`) : _(msg`Pause`)
                    }
                    onClick={() => setPausedAt((value) => (value === null ? latestId : null))}
                />
                <ToolbarChip
                    active={false}
                    icon="trash"
                    label={_(msg`Clear`)}
                    onClick={() => setClearedBefore(latestId)}
                />
            </div>

            <div className="remote-scrollbar-hidden max-h-96 overflow-y-auto overscroll-contain rounded-[12px] border border-white/8 bg-black/30">
                {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                        <Icon className="mx-auto size-6 text-(--deck-fg-4)" name="activity" />
                        <p className="mt-2 text-[12px] text-(--deck-fg-3)">
                            {running ? (
                                <Trans>Waiting for OSC traffic…</Trans>
                            ) : (
                                <Trans>Turn the bot on to see traffic.</Trans>
                            )}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-white/5">
                        {rows.map((entry) => (
                            <MonitorRow key={entry.id} entry={entry} onBind={onBind} />
                        ))}
                    </ul>
                )}
            </div>

            <Composer targets={targets} running={running} monitor={monitor} />
        </div>
    );
};

const DIRECTION_STYLE: Record<EOscDirection, { icon: IconName; className: string }> = {
    [EOscDirection.In]: {
        icon: 'arrow-down',
        className:
            'bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent)',
    },
    [EOscDirection.Out]: { icon: 'arrow-up', className: 'bg-violet-400/15 text-violet-300' },
    [EOscDirection.Error]: { icon: 'alert', className: 'bg-red-500/15 text-red-300' },
    [EOscDirection.Info]: { icon: 'dot', className: 'bg-white/8 text-(--deck-fg-3)' },
};

const MonitorRow = ({
    entry,
    onBind,
}: {
    entry: OscActivityEntry;
    onBind: (entry: OscActivityEntry) => void;
}) => {
    const { _ } = useLingui();
    const style = DIRECTION_STYLE[entry.direction] ?? DIRECTION_STYLE[EOscDirection.Info];
    const time = new Date(entry.at);

    return (
        <li className="group flex items-start gap-2 px-2.5 py-2 motion-safe:animate-[osc-rise_200ms_ease-out]">
            <span
                className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px]',
                    style.className,
                )}
            >
                <Icon className="size-3" name={style.icon} stroke={2.2} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-mono text-[11.5px] text-(--deck-fg)">
                        {entry.address || entry.note}
                    </span>
                    {entry.count > 1 ? (
                        <span
                            key={entry.count}
                            className="shrink-0 rounded-full bg-white/8 px-1.5 font-mono text-[9.5px] font-bold tabular-nums text-(--deck-fg-2) motion-safe:animate-[osc-rise_160ms_ease-out]"
                        >
                            ×{entry.count}
                        </span>
                    ) : null}
                </div>
                {entry.args.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {entry.args.map((arg, index) => (
                            <ArgChip key={index} arg={arg} />
                        ))}
                    </div>
                ) : null}
                {entry.address && entry.note ? (
                    <div
                        className={cn(
                            'mt-1 text-[11px] leading-snug',
                            entry.failed ? 'text-amber-300' : 'text-(--deck-fg-3)',
                        )}
                    >
                        {entry.note}
                    </div>
                ) : null}
                <div className="mt-0.5 font-mono text-[9.5px] text-(--deck-fg-4)">
                    {time.toLocaleTimeString([], { hour12: false })}
                    {entry.peer ? ` · ${entry.peer}` : ''}
                </div>
            </div>
            {entry.direction === EOscDirection.In && entry.address ? (
                <button
                    type="button"
                    className="shrink-0 rounded-[7px] border border-white/10 px-2 py-1 text-[10.5px] font-semibold text-(--deck-fg-3) opacity-80 hover:border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] hover:text-(--deck-accent) group-hover:opacity-100"
                    aria-label={_(msg`Create a binding for ${entry.address}`)}
                    onClick={() => onBind(entry)}
                >
                    <Trans>Bind</Trans>
                </button>
            ) : null}
        </li>
    );
};

const ARG_TONE: Record<string, string> = {
    i: 'text-sky-300',
    f: 'text-emerald-300',
    d: 'text-emerald-300',
    s: 'text-amber-200',
    T: 'text-(--deck-accent)',
    F: 'text-red-300',
};

const ArgChip = ({ arg }: { arg: OscArgPreview }) => {
    return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-[5px] bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px]">
            <span className="text-(--deck-fg-4)">{arg.type}</span>
            <span className={cn('truncate', ARG_TONE[arg.type] ?? 'text-(--deck-fg-2)')}>
                {formatOscArg(arg)}
            </span>
        </span>
    );
};

const ToolbarChip = ({
    active,
    icon,
    label,
    onClick,
}: {
    active: boolean;
    icon: IconName;
    label: string;
    onClick: () => void;
}) => {
    return (
        <button
            type="button"
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                active
                    ? 'border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] text-(--deck-accent)'
                    : 'border-white/10 bg-white/4 text-(--deck-fg-3) hover:text-(--deck-fg-2)',
            )}
            onClick={onClick}
        >
            <Icon className="size-3" name={icon} stroke={2} />
            {label}
        </button>
    );
};

const Composer = ({
    targets,
    running,
    monitor,
}: {
    targets: OscTarget[];
    running: boolean;
    monitor: OscStudioModel['monitor'];
}) => {
    const { _ } = useLingui();
    const [address, setAddress] = useState('/avatar/parameters/');
    const [args, setArgs] = useState('1');
    const [targetId, setTargetId] = useState('');
    const validAddress = isValidOscAddress(address.trim());

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (validAddress) monitor.send(address, args, targetId || null);
    };

    return (
        <form className="rounded-[12px] border border-white/8 bg-black/15 p-2.5" onSubmit={submit}>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">
                <Icon className="size-3" name="send" />
                <Trans>Send a test message</Trans>
            </div>
            <input
                value={address}
                spellCheck={false}
                autoCapitalize="off"
                aria-label={_(msg`Address to send`)}
                aria-invalid={!validAddress || undefined}
                className={cn(
                    INPUT_CLASS,
                    'font-mono text-[12px]',
                    !validAddress && 'border-red-400/50',
                )}
                onInput={(event) => setAddress(event.currentTarget.value)}
            />
            <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-1.5">
                <input
                    value={args}
                    spellCheck={false}
                    autoCapitalize="off"
                    placeholder={_(msg`1 0.5 true "text"`)}
                    aria-label={_(msg`Arguments`)}
                    className={cn(INPUT_CLASS, 'font-mono text-[12px]')}
                    onInput={(event) => setArgs(event.currentTarget.value)}
                />
                <select
                    aria-label={_(msg`Send to`)}
                    className={cn(INPUT_CLASS, 'appearance-none text-[12px]')}
                    value={targetId}
                    onChange={(event) => setTargetId(event.currentTarget.value)}
                >
                    <option value="">{_(msg`All outputs`)}</option>
                    {targets.map((target) => (
                        <option key={target.id} value={target.id}>
                            {target.name}
                        </option>
                    ))}
                </select>
            </div>
            <button
                type="submit"
                disabled={!running || !validAddress}
                className="mt-2 flex h-9.5 w-full items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) text-[12px] font-bold text-black disabled:opacity-35 active:scale-[0.99]"
            >
                <Icon className="size-3.5" name="send" stroke={2.2} />
                <Trans>Send</Trans>
            </button>
        </form>
    );
};
