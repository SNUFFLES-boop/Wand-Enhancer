import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { copyText } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/ui';
import { CommitInput, INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Switch } from '@/shared/ui/Switch';
import { OSC_LIMITS, type OscBotConfig, type OscTarget } from '../../../protocol/osc';
import type { OscStudioModel } from '../model/use-osc-studio';
import { Eyebrow, RangeField, SettingRow } from './StudioSection';

type NetworkSectionProps = {
    config: OscBotConfig;
    network: OscStudioModel['network'];
    backup: OscStudioModel['backup'];
};

export const NetworkSection = ({ config, network, backup }: NetworkSectionProps) => {
    const { _ } = useLingui();
    const [backupOpen, setBackupOpen] = useState(false);
    // On a phone the panel's own host is the PC, which is exactly where controllers must send.
    const reachableHost = config.allowLan ? window.location.hostname || '<pc-ip>' : '127.0.0.1';
    const endpoint = `${reachableHost}:${config.listenPort}`;

    return (
        <div className="space-y-4">
            <div>
                <Eyebrow>
                    <Trans>Listener</Trans>
                </Eyebrow>
                <div className="rounded-[12px] border border-white/8 bg-black/15 px-3">
                    <SettingRow
                        title={_(msg`Listen port`)}
                        description={_(msg`VRChat sends to 9001, TouchOSC to 8000.`)}
                    >
                        <div className="w-24">
                            <CommitInput
                                mono
                                inputMode="numeric"
                                value={String(config.listenPort)}
                                label={_(msg`Listen port`)}
                                className="h-9 text-center"
                                onCommit={network.setListenPort}
                            />
                        </div>
                    </SettingRow>
                    <SettingRow
                        title={_(msg`Allow LAN devices`)}
                        description={_(
                            msg`Listen on every network interface so phones and tablets can send OSC.`,
                        )}
                    >
                        <Switch
                            checked={config.allowLan}
                            label={_(msg`Allow LAN devices`)}
                            onChange={network.setAllowLan}
                        />
                    </SettingRow>
                    {config.allowLan ? (
                        <p className="-mt-1 mb-2 flex gap-1.5 rounded-[8px] bg-amber-400/10 px-2.5 py-2 text-[11.5px] leading-snug text-amber-200">
                            <Icon className="mt-0.5 size-3.5 shrink-0" name="alert" />
                            <Trans>
                                OSC has no password: anyone on this network can drive your mods.
                            </Trans>
                        </p>
                    ) : null}
                    <div className="flex items-center gap-2 border-t border-white/6 py-2.5">
                        <span className="min-w-0 flex-1 text-[12px] text-(--deck-fg-3)">
                            <Trans>Point controllers at</Trans>{' '}
                            <span className="font-mono text-(--deck-fg)">{endpoint}</span>
                        </span>
                        <CopyButton value={endpoint} label={_(msg`Copy listen address`)} />
                    </div>
                </div>
            </div>

            <div>
                <Eyebrow>
                    <Trans>Routing</Trans>
                </Eyebrow>
                <div className="rounded-[12px] border border-white/8 bg-black/15 px-3">
                    <SettingRow
                        title={_(msg`Auto-map every mod`)}
                        description={_(
                            msg`Answer on ${config.prefix}/cheat/<mod> without any binding.`,
                        )}
                    >
                        <Switch
                            checked={config.autoMap}
                            label={_(msg`Auto-map every mod`)}
                            onChange={network.setAutoMap}
                        />
                    </SettingRow>
                    <SettingRow title={_(msg`Address prefix`)}>
                        <div className="w-28">
                            <CommitInput
                                mono
                                value={config.prefix}
                                label={_(msg`Address prefix`)}
                                className="h-9"
                                onCommit={network.setPrefix}
                            />
                        </div>
                    </SettingRow>
                    <div className="border-t border-white/6">
                        <RangeField
                            label={_(msg`Fader smoothing`)}
                            value={config.throttleMs}
                            min={0}
                            max={250}
                            step={10}
                            format={(value) => (value === 0 ? _(msg`off`) : `${value} ms`)}
                            onChange={network.setThrottle}
                        />
                    </div>
                </div>
            </div>

            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <Eyebrow>
                        <Trans>Outputs</Trans>
                    </Eyebrow>
                    <span className="font-mono text-[10px] text-(--deck-fg-4)">
                        {config.targets.length}/{OSC_LIMITS.maxTargets}
                    </span>
                </div>
                <div className="space-y-2">
                    {config.targets.map((target) => (
                        <TargetCard key={target.id} target={target} network={network} />
                    ))}
                    {config.targets.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-white/12 px-3 py-4 text-center text-[12px] text-(--deck-fg-3)">
                            <Trans>No outputs: the bot can listen, but nothing will be sent.</Trans>
                        </p>
                    ) : null}
                </div>
                {config.targets.length < OSC_LIMITS.maxTargets ? (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button
                            type="button"
                            className="remote-glass-control flex h-9.5 items-center justify-center gap-1.5 rounded-[10px] border text-[12px] font-semibold text-(--deck-fg-2)"
                            onClick={() => network.addTarget(true)}
                        >
                            <Icon className="size-3.5" name="message" />
                            <Trans>Add VRChat</Trans>
                        </button>
                        <button
                            type="button"
                            className="remote-glass-control flex h-9.5 items-center justify-center gap-1.5 rounded-[10px] border text-[12px] font-semibold text-(--deck-fg-2)"
                            onClick={() => network.addTarget(false)}
                        >
                            <Icon className="size-3.5" name="plus" />
                            <Trans>Add output</Trans>
                        </button>
                    </div>
                ) : null}
            </div>

            <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-[12px] border border-white/8 bg-black/15 px-3 py-2.5 text-left hover:bg-white/4"
                onClick={() => setBackupOpen(true)}
            >
                <Icon className="size-4 text-(--deck-fg-3)" name="download" />
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-(--deck-fg)">
                        <Trans>Backup & restore</Trans>
                    </span>
                    <span className="block text-[11.5px] text-(--deck-fg-3)">
                        <Trans>Copy the whole bot profile as JSON, or paste one in.</Trans>
                    </span>
                </span>
                <Icon className="size-4 text-(--deck-fg-4)" name="chevron-right" />
            </button>
            {backupOpen
                ? createPortal(
                      <BackupModal backup={backup} onClose={() => setBackupOpen(false)} />,
                      document.body,
                  )
                : null}
        </div>
    );
};

const TargetCard = ({
    target,
    network,
}: {
    target: OscTarget;
    network: OscStudioModel['network'];
}) => {
    const { _ } = useLingui();

    return (
        <div
            className={cn(
                'rounded-[12px] border p-2.5 transition-opacity motion-safe:animate-[osc-rise_220ms_ease-out]',
                target.enabled
                    ? 'border-white/10 bg-white/3'
                    : 'border-white/6 bg-black/10 opacity-60',
            )}
        >
            <div className="flex items-center gap-2">
                <CommitInput
                    value={target.name}
                    label={_(msg`Output name`)}
                    className="h-8 flex-1 border-transparent bg-transparent px-1.5 text-[13px] font-semibold shadow-none"
                    onCommit={(name) => {
                        if (!name.trim()) return false;
                        network.updateTarget(target.id, { name: name.trim().slice(0, 32) });
                        return true;
                    }}
                />
                <Switch
                    size="sm"
                    checked={target.enabled}
                    label={_(msg`Enable ${target.name}`)}
                    onChange={(enabled) => network.updateTarget(target.id, { enabled })}
                />
                <IconButton
                    size="sm"
                    icon="trash"
                    label={_(msg`Remove ${target.name}`)}
                    className="border-transparent bg-transparent"
                    onClick={() => network.removeTarget(target.id)}
                />
            </div>
            <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_88px] gap-1.5">
                <CommitInput
                    mono
                    value={target.host}
                    label={_(msg`Host of ${target.name}`)}
                    placeholder="192.168.1.20"
                    className="h-9"
                    onCommit={(host) => network.setTargetHost(target.id, host)}
                />
                <CommitInput
                    mono
                    inputMode="numeric"
                    value={String(target.port)}
                    label={_(msg`Port of ${target.name}`)}
                    className="h-9 text-center"
                    onCommit={(port) => network.setTargetPort(target.id, port)}
                />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <CapabilityChip
                    active={target.chatbox}
                    label={_(msg`Chatbox`)}
                    onToggle={() => network.updateTarget(target.id, { chatbox: !target.chatbox })}
                />
                <CapabilityChip
                    active={target.bindings}
                    label={_(msg`Binding feedback`)}
                    onToggle={() => network.updateTarget(target.id, { bindings: !target.bindings })}
                />
                <CapabilityChip
                    active={target.state}
                    label={_(msg`State mirror`)}
                    onToggle={() => network.updateTarget(target.id, { state: !target.state })}
                />
            </div>
        </div>
    );
};

const CapabilityChip = ({
    active,
    label,
    onToggle,
}: {
    active: boolean;
    label: string;
    onToggle: () => void;
}) => {
    return (
        <button
            type="button"
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                active
                    ? 'border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_14%,transparent)] text-(--deck-accent)'
                    : 'border-white/10 bg-white/4 text-(--deck-fg-4)',
            )}
            onClick={onToggle}
        >
            <Icon className="size-3" name={active ? 'check' : 'plus'} stroke={2.2} />
            {label}
        </button>
    );
};

export const CopyButton = ({ value, label }: { value: string; label: string }) => {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        },
        [],
    );

    const copy = () => {
        void copyText(value).then((ok) => {
            if (!ok) return;
            setCopied(true);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), 1400);
        });
    };

    return (
        <IconButton
            size="sm"
            icon={copied ? 'check' : 'copy'}
            label={label}
            active={copied}
            className={copied ? undefined : 'border-transparent bg-transparent'}
            onClick={copy}
        />
    );
};

const BackupModal = ({
    backup,
    onClose,
}: {
    backup: OscStudioModel['backup'];
    onClose: () => void;
}) => {
    const { _ } = useLingui();
    const [text, setText] = useState(backup.exportJson);
    const [state, setState] = useState<'idle' | 'copied' | 'imported' | 'invalid'>('idle');

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
            <button
                type="button"
                aria-label={_(msg`Close backup`)}
                className="absolute inset-0"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={_(msg`Backup & restore`)}
                className="remote-glass-drawer relative w-full max-w-120 rounded-[18px] border border-white/10 p-4 motion-safe:animate-[osc-rise_240ms_ease-out]"
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-[15px] font-bold text-(--deck-fg)">
                            <Trans>Backup & restore</Trans>
                        </h3>
                        <p className="mt-0.5 text-[12px] text-(--deck-fg-3)">
                            <Trans>Import keeps the bot's on/off state as it is now.</Trans>
                        </p>
                    </div>
                    <IconButton shrink icon="x" label={_(msg`Close backup`)} onClick={onClose} />
                </div>
                <textarea
                    value={text}
                    spellCheck={false}
                    aria-label={_(msg`Bot profile JSON`)}
                    className={cn(
                        INPUT_CLASS,
                        'h-64 resize-none py-2 font-mono text-[11px] leading-relaxed',
                        state === 'invalid' && 'border-red-400/60',
                    )}
                    onInput={(event) => {
                        setText(event.currentTarget.value);
                        setState('idle');
                    }}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className="remote-glass-control flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[12px] font-semibold text-(--deck-fg-2)"
                        onClick={() => void copyText(text).then((ok) => ok && setState('copied'))}
                    >
                        <Icon className="size-3.5" name={state === 'copied' ? 'check' : 'copy'} />
                        {state === 'copied' ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
                    </button>
                    <button
                        type="button"
                        className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) text-[12px] font-bold text-black"
                        onClick={() => {
                            if (backup.importJson(text)) {
                                setState('imported');
                                window.setTimeout(onClose, 500);
                            } else {
                                setState('invalid');
                            }
                        }}
                    >
                        <Icon
                            className="size-3.5"
                            name={state === 'imported' ? 'check' : 'upload'}
                            stroke={2.1}
                        />
                        {state === 'invalid' ? (
                            <Trans>Not valid JSON</Trans>
                        ) : (
                            <Trans>Import</Trans>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
