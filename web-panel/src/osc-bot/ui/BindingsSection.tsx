import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useEffect, useMemo } from 'react';

import { revealInScroller } from '@/shared/lib/reveal';
import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';
import { Switch } from '@/shared/ui/Switch';
import type { CheatSchema } from '../../../protocol/messages';
import { OSC_LIMITS, type OscActivityEntry, type OscBinding } from '../../../protocol/osc';
import { actionNeedsCheat } from '../model/bindings';
import type { LaunchableGame, OscStudioModel } from '../model/use-osc-studio';
import { BindingEditor } from './BindingEditor';
import { ACTION_LABELS } from './labels';

type BindingsSectionProps = {
    bindings: OscBinding[];
    cheats: CheatSchema[];
    activity: OscActivityEntry[];
    currentGameId: string | null;
    launchableGames: LaunchableGame[];
    model: OscStudioModel['bindings'];
    expandedId: string | null;
    onExpand: (id: string | null) => void;
};

export const BindingsSection = ({
    bindings,
    cheats,
    activity,
    currentGameId,
    launchableGames,
    model,
    expandedId,
    onExpand,
}: BindingsSectionProps) => {
    const { _ } = useLingui();
    const lastHit = useMemo(() => {
        const hits = new Map<string, number>();
        for (const entry of activity) {
            if (entry.bindingId) hits.set(entry.bindingId, entry.at);
        }
        return hits;
    }, [activity]);

    const learningId = model.learning?.bindingId ?? null;

    useEffect(() => {
        if (!expandedId) return;
        // Wait for the editor to start expanding so its height counts.
        const timer = window.setTimeout(
            () => revealInScroller(document.getElementById(`binding-${expandedId}`)),
            120,
        );
        return () => window.clearTimeout(timer);
    }, [expandedId]);

    const addBinding = () => onExpand(model.add());
    const full = bindings.length >= OSC_LIMITS.maxBindings;

    return (
        <div>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
                <button
                    type="button"
                    disabled={full}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) text-[12px] font-bold text-black shadow-[0_8px_24px_-12px_var(--deck-accent)] active:scale-[0.98] disabled:opacity-40"
                    onClick={addBinding}
                >
                    <Icon className="size-3.5" name="plus" stroke={2.2} />
                    <Trans>New binding</Trans>
                </button>
                <button
                    type="button"
                    disabled={full || cheats.length === 0}
                    title={_(msg`One /avatar/parameters/Wand… address per mod of this trainer`)}
                    className="remote-glass-control flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[12px] font-semibold text-(--deck-fg-2) active:scale-[0.98] disabled:opacity-40"
                    onClick={() => model.generate()}
                >
                    <Icon className="size-3.5" name="wand" />
                    <Trans>Avatar params</Trans>
                </button>
            </div>

            {learningId ? (
                <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-[12px] border border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_10%,transparent)] px-3 py-2.5 motion-safe:animate-[osc-rise_220ms_ease-out]">
                    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)]">
                        <span className="osc-radar-sweep absolute inset-0 rounded-full" />
                        <Icon className="relative size-4 text-(--deck-accent)" name="radar" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-(--deck-fg)">
                            <Trans>Listening for a control…</Trans>
                        </span>
                        <span className="block text-[11.5px] text-(--deck-fg-3)">
                            <Trans>Move a fader, press a button or flip an avatar toggle.</Trans>
                        </span>
                    </span>
                    <button
                        type="button"
                        className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-semibold text-(--deck-fg-2) hover:bg-white/6"
                        onClick={model.stopLearning}
                    >
                        <Trans>Cancel</Trans>
                    </button>
                </div>
            ) : null}

            {bindings.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-white/12 px-4 py-6 text-center">
                    <Icon className="mx-auto size-6 text-(--deck-fg-4)" name="link" />
                    <p className="mt-2 text-[13px] font-semibold text-(--deck-fg-2)">
                        <Trans>No bindings yet</Trans>
                    </p>
                    <p className="mx-auto mt-1 max-w-72 text-[12px] leading-relaxed text-(--deck-fg-3)">
                        <Trans>
                            Every mod already answers on the Address Map. Bindings map any other
                            address, like an avatar parameter or a TouchOSC fader, to a mod or an
                            action.
                        </Trans>
                    </p>
                </div>
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-white/8">
                    {bindings.map((binding, index) => (
                        <BindingRow
                            key={binding.id}
                            binding={binding}
                            cheats={cheats}
                            first={index === 0}
                            expanded={binding.id === expandedId}
                            lastHitAt={lastHit.get(binding.id) ?? null}
                            onExpand={() => onExpand(binding.id === expandedId ? null : binding.id)}
                            onToggleEnabled={(enabled) =>
                                model.update(binding.id, { enabled }, true)
                            }
                        >
                            <BindingEditor
                                binding={binding}
                                cheats={cheats}
                                currentGameId={currentGameId}
                                launchableGames={launchableGames}
                                learning={learningId === binding.id}
                                onChange={(patch, immediate) =>
                                    model.update(binding.id, patch, immediate)
                                }
                                onLearn={() =>
                                    learningId === binding.id
                                        ? model.stopLearning()
                                        : model.startLearning(binding.id)
                                }
                                onDuplicate={() => onExpand(model.duplicate(binding.id))}
                                onRemove={() => {
                                    model.remove(binding.id);
                                    onExpand(null);
                                }}
                            />
                        </BindingRow>
                    ))}
                </ul>
            )}
            <p className="mt-2 text-right font-mono text-[10px] text-(--deck-fg-4)">
                {bindings.length}/{OSC_LIMITS.maxBindings}
            </p>
        </div>
    );
};

type BindingRowProps = {
    binding: OscBinding;
    cheats: CheatSchema[];
    first: boolean;
    expanded: boolean;
    lastHitAt: number | null;
    children: React.ReactNode;
    onExpand: () => void;
    onToggleEnabled: (enabled: boolean) => void;
};

const BindingRow = ({
    binding,
    cheats,
    first,
    expanded,
    lastHitAt,
    children,
    onExpand,
    onToggleEnabled,
}: BindingRowProps) => {
    const { _ } = useLingui();
    const action = ACTION_LABELS[binding.action];
    const cheat =
        cheats.find((entry) => entry.target === binding.target) ??
        cheats.find((entry) => entry.name.toLowerCase() === binding.cheatName?.toLowerCase());
    const needsCheat = actionNeedsCheat(binding.action);
    const subject = needsCheat ? (cheat?.name ?? binding.cheatName ?? _(msg`No mod`)) : null;
    const missing = needsCheat && !cheat;
    // A hit within the last few seconds replays the flash; keyed so each new hit restarts it.
    const recentHit = lastHitAt !== null && Date.now() - lastHitAt < 4000;

    return (
        <li
            id={`binding-${binding.id}`}
            className={cn(!first && 'border-t border-white/6', expanded && 'bg-white/2.5')}
        >
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/4 text-(--deck-fg-2)">
                    {recentHit ? (
                        <span
                            key={lastHitAt}
                            className="absolute inset-0 rounded-[9px] motion-safe:animate-[osc-flash_900ms_ease-out]"
                        />
                    ) : null}
                    <Icon
                        className={cn('size-3.75', binding.enabled && 'text-(--deck-accent)')}
                        name={action.icon}
                    />
                </span>
                <button
                    type="button"
                    aria-expanded={expanded}
                    className="min-w-0 flex-1 text-left"
                    onClick={onExpand}
                >
                    <span
                        className={cn(
                            'block truncate font-mono text-[12px]',
                            binding.enabled
                                ? 'text-(--deck-fg)'
                                : 'text-(--deck-fg-4) line-through',
                        )}
                    >
                        {binding.address}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-(--deck-fg-3)">
                        <span className="shrink-0 font-semibold text-(--deck-fg-2)">
                            {_(action.label)}
                        </span>
                        {subject ? (
                            <span className={cn('truncate', missing && 'text-amber-300')}>
                                · {subject}
                            </span>
                        ) : null}
                        {binding.scope === null && needsCheat ? (
                            <span className="shrink-0 rounded-[4px] bg-white/6 px-1 font-mono text-[9px] uppercase tracking-[0.08em]">
                                <Trans>any game</Trans>
                            </span>
                        ) : null}
                        {binding.feedback ? (
                            <Icon className="size-3 shrink-0 text-(--deck-fg-4)" name="refresh" />
                        ) : null}
                    </span>
                </button>
                <Switch
                    size="sm"
                    checked={binding.enabled}
                    label={_(msg`Enable ${binding.address}`)}
                    onChange={onToggleEnabled}
                />
                <Icon
                    className={cn(
                        'size-4 shrink-0 text-(--deck-fg-4) transition-transform duration-300',
                        expanded ? 'rotate-180' : '',
                    )}
                    name="chevron-down"
                />
            </div>
            <div
                className={cn(
                    'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                    expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="min-h-0 overflow-hidden">{expanded ? children : null}</div>
            </div>
        </li>
    );
};
