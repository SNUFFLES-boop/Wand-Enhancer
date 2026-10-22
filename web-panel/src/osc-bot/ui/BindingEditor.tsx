import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';

import { cn } from '@/shared/lib/ui';
import { CommitInput, INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import {
    isNumericCheat,
    isOptionCheat,
    numericRange,
    optionLabel,
    optionValue,
} from '../../../protocol/cheat-kinds';
import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import { EOscAction, isValidOscAddress, OSC_LIMITS, type OscBinding } from '../../../protocol/osc';
import {
    actionNeedsCheat,
    BINDING_ACTIONS,
    defaultActionFor,
    describeCheatInput,
    isCheatCompatible,
} from '../model/bindings';
import type { LaunchableGame } from '../model/use-osc-studio';
import { ACTION_LABELS } from './labels';
import { Eyebrow, SettingRow } from './StudioSection';

type BindingEditorProps = {
    binding: OscBinding;
    cheats: CheatSchema[];
    currentGameId: string | null;
    launchableGames: LaunchableGame[];
    learning: boolean;
    onChange: (patch: Partial<OscBinding>, immediate?: boolean) => void;
    onLearn: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
};

enum EScope {
    Game = 'game',
    Any = 'any',
}

export const BindingEditor = ({
    binding,
    cheats,
    currentGameId,
    launchableGames,
    learning,
    onChange,
    onLearn,
    onDuplicate,
    onRemove,
}: BindingEditorProps) => {
    const { _ } = useLingui();
    // Literal braces must reach ICU as values, or they are parsed as placeholders.
    const alternatives = '{a,b}';
    const needsCheat = actionNeedsCheat(binding.action);
    const cheat =
        cheats.find((entry) => entry.target === binding.target) ??
        cheats.find((entry) => entry.name.toLowerCase() === binding.cheatName?.toLowerCase()) ??
        null;
    const compatible = cheats.filter((entry) => isCheatCompatible(binding.action, entry));
    const categories = Array.from(new Set(compatible.map((entry) => entry.category)));

    const pickCheat = (target: string) => {
        const next = cheats.find((entry) => entry.target === target);
        if (!next) return;
        onChange(
            {
                target: next.target,
                cheatName: next.name,
                action: isCheatCompatible(binding.action, next)
                    ? binding.action
                    : defaultActionFor(next),
            },
            true,
        );
    };

    const pickAction = (action: EOscAction) => {
        const patch: Partial<OscBinding> = { action };
        // Keep the chosen mod when it still fits; otherwise pick the first one that does.
        if (actionNeedsCheat(action) && (!cheat || !isCheatCompatible(action, cheat))) {
            const fallback = cheats.find((entry) => isCheatCompatible(action, entry));
            patch.target = fallback?.target ?? null;
            patch.cheatName = fallback?.name ?? null;
        }
        if (action === EOscAction.Set && cheat && isNumericCheat(cheat)) patch.rescale = true;
        onChange(patch, true);
    };

    return (
        <div className="space-y-3.5 border-t border-white/6 px-3 pb-3.5 pt-3">
            <div>
                <Eyebrow>
                    <Trans>Address</Trans>
                </Eyebrow>
                <div className="flex gap-1.5">
                    <CommitInput
                        mono
                        value={binding.address}
                        label={_(msg`OSC address`)}
                        placeholder="/avatar/parameters/MyToggle"
                        onCommit={(value) => {
                            const address = value.trim();
                            if (!isValidOscAddress(address)) return false;
                            onChange({ address }, true);
                            return true;
                        }}
                    />
                    <button
                        type="button"
                        aria-pressed={learning}
                        className={cn(
                            'flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors',
                            learning
                                ? 'border-(--deck-accent) bg-[color-mix(in_oklab,var(--deck-accent)_18%,transparent)] text-(--deck-accent)'
                                : 'border-white/10 bg-white/5 text-(--deck-fg-2) hover:text-(--deck-fg)',
                        )}
                        onClick={onLearn}
                    >
                        <Icon
                            className={cn('size-3.5', learning && 'motion-safe:animate-spin')}
                            name="radar"
                        />
                        {learning ? <Trans>Listening</Trans> : <Trans>Learn</Trans>}
                    </button>
                </div>
                <p className="mt-1.5 text-[11px] text-(--deck-fg-4)">
                    <Trans>Wildcards work: * ? [1-4] {alternatives}</Trans>
                </p>
            </div>

            <div>
                <Eyebrow>
                    <Trans>Action</Trans>
                </Eyebrow>
                <div className="grid grid-cols-5 gap-1">
                    {BINDING_ACTIONS.map((action) => {
                        const meta = ACTION_LABELS[action];
                        const active = action === binding.action;
                        const usable =
                            !actionNeedsCheat(action) ||
                            cheats.some((entry) => isCheatCompatible(action, entry)) ||
                            cheats.length === 0;
                        return (
                            <button
                                key={action}
                                type="button"
                                aria-pressed={active}
                                disabled={!usable}
                                className={cn(
                                    'flex flex-col items-center gap-1 rounded-[10px] border px-1 py-2 text-[10.5px] font-semibold transition-all disabled:opacity-30',
                                    active
                                        ? 'border-[color-mix(in_oklab,var(--deck-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_15%,transparent)] text-(--deck-fg) shadow-[0_0_18px_-8px_var(--deck-accent)]'
                                        : 'border-white/8 bg-white/3 text-(--deck-fg-3) hover:text-(--deck-fg-2)',
                                )}
                                onClick={() => pickAction(action)}
                            >
                                <Icon
                                    className={cn('size-4', active && 'text-(--deck-accent)')}
                                    name={meta.icon}
                                />
                                <span className="truncate">{_(meta.label)}</span>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-(--deck-fg-3)">
                    {_(ACTION_LABELS[binding.action].hint)}
                </p>
            </div>

            {needsCheat ? (
                <div>
                    <Eyebrow>
                        <Trans>Mod</Trans>
                    </Eyebrow>
                    {cheats.length === 0 ? (
                        <p className="rounded-[10px] border border-white/8 bg-black/15 px-3 py-2.5 text-[12px] text-(--deck-fg-3)">
                            {binding.cheatName ? (
                                <Trans>
                                    Bound to "{binding.cheatName}". Start a trainer to change the
                                    mod.
                                </Trans>
                            ) : (
                                <Trans>Start a trainer to pick a mod.</Trans>
                            )}
                        </p>
                    ) : (
                        <select
                            aria-label={_(msg`Mod`)}
                            className={cn(INPUT_CLASS, 'appearance-none')}
                            value={cheat?.target ?? ''}
                            onChange={(event) => pickCheat(event.currentTarget.value)}
                        >
                            {!cheat ? (
                                <option value="">
                                    {binding.cheatName
                                        ? _(msg`"${binding.cheatName}" is not in this trainer`)
                                        : _(msg`Choose a mod…`)}
                                </option>
                            ) : null}
                            {categories.map((category) => (
                                <optgroup key={category} label={category}>
                                    {compatible
                                        .filter((entry) => entry.category === category)
                                        .map((entry) => (
                                            <option key={entry.uuid} value={entry.target}>
                                                {entry.name} · {describeCheatInput(entry)}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    )}
                    <div className="mt-2">
                        <Segmented
                            size="sm"
                            label={_(msg`Where this binding applies`)}
                            value={binding.scope ? EScope.Game : EScope.Any}
                            options={[
                                {
                                    value: EScope.Game,
                                    label: _(msg`This game only`),
                                    icon: 'gamepad',
                                },
                                {
                                    value: EScope.Any,
                                    label: _(msg`Any game (by name)`),
                                    icon: 'world',
                                },
                            ]}
                            onChange={(scope) =>
                                onChange(
                                    {
                                        scope:
                                            scope === EScope.Game
                                                ? (binding.scope ?? currentGameId)
                                                : null,
                                    },
                                    true,
                                )
                            }
                        />
                    </div>
                </div>
            ) : null}

            <ActionOptions
                binding={binding}
                cheat={cheat}
                launchableGames={launchableGames}
                onChange={onChange}
            />

            {needsCheat ? (
                <div className="rounded-[12px] border border-white/8 bg-black/15 px-3">
                    <SettingRow
                        title={_(msg`Send feedback`)}
                        description={_(
                            msg`Echoes the mod's value back to this address, so faders and avatar toggles stay in sync.`,
                        )}
                    >
                        <Switch
                            checked={binding.feedback}
                            label={_(msg`Send feedback`)}
                            onChange={(feedback) => onChange({ feedback }, true)}
                        />
                    </SettingRow>
                </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-[12px] font-semibold text-(--deck-fg-2) hover:bg-white/6"
                    onClick={onDuplicate}
                >
                    <Icon className="size-3.5" name="copy" />
                    <Trans>Duplicate</Trans>
                </button>
                <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-[12px] font-semibold text-red-300 hover:bg-red-500/10"
                    onClick={onRemove}
                >
                    <Icon className="size-3.5" name="trash" />
                    <Trans>Delete</Trans>
                </button>
            </div>
        </div>
    );
};

type ActionOptionsProps = {
    binding: OscBinding;
    cheat: CheatSchema | null;
    launchableGames: LaunchableGame[];
    onChange: (patch: Partial<OscBinding>, immediate?: boolean) => void;
};

const ActionOptions = ({ binding, cheat, launchableGames, onChange }: ActionOptionsProps) => {
    const { _ } = useLingui();
    const gameToken = '{game}';

    if (binding.action === EOscAction.Set) {
        const range = cheat && isNumericCheat(cheat) ? numericRange(cheat) : null;
        return (
            <div className="rounded-[12px] border border-white/8 bg-black/15 px-3">
                <SettingRow
                    title={_(msg`Rescale input`)}
                    description={
                        range
                            ? _(
                                  msg`Maps ${binding.inputMin}–${binding.inputMax} onto ${range.min}–${range.max}.`,
                              )
                            : _(msg`Maps the input range onto the mod's options.`)
                    }
                >
                    <Switch
                        checked={binding.rescale}
                        label={_(msg`Rescale input`)}
                        onChange={(rescale) => onChange({ rescale }, true)}
                    />
                </SettingRow>
                {binding.rescale ? (
                    <div className="grid grid-cols-2 gap-2 pb-3">
                        <NumberCommit
                            label={_(msg`Input from`)}
                            value={binding.inputMin}
                            onCommit={(inputMin) => onChange({ inputMin }, true)}
                        />
                        <NumberCommit
                            label={_(msg`Input to`)}
                            value={binding.inputMax}
                            onCommit={(inputMax) => onChange({ inputMax }, true)}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    if (binding.action === EOscAction.Fixed) {
        if (cheat?.type === ECheatType.Toggle) {
            const on = binding.value === 1 || binding.value === 'true' || binding.value === 'on';
            return (
                <Segmented
                    label={_(msg`Value to write`)}
                    value={on ? 'on' : 'off'}
                    options={[
                        { value: 'on', label: _(msg`Turn on`) },
                        { value: 'off', label: _(msg`Turn off`) },
                    ]}
                    onChange={(value) => onChange({ value: value === 'on' ? 1 : 0 }, true)}
                />
            );
        }
        if (cheat && isOptionCheat(cheat)) {
            return (
                <select
                    aria-label={_(msg`Value to write`)}
                    className={cn(INPUT_CLASS, 'appearance-none')}
                    value={String(binding.value)}
                    onChange={(event) => onChange({ value: event.currentTarget.value }, true)}
                >
                    {(cheat.args.options ?? []).map((option) => (
                        <option
                            key={String(optionValue(option))}
                            value={String(optionValue(option))}
                        >
                            {optionLabel(option)}
                        </option>
                    ))}
                </select>
            );
        }
        return (
            <NumberCommit
                label={_(msg`Value to write`)}
                value={Number(binding.value) || 0}
                onCommit={(value) => onChange({ value }, true)}
            />
        );
    }

    if (binding.action === EOscAction.Step) {
        return (
            <NumberCommit
                label={_(msg`Amount per press`)}
                value={Number(binding.value) || 1}
                onCommit={(value) => onChange({ value }, true)}
            />
        );
    }

    if (binding.action === EOscAction.Chatbox) {
        return (
            <div>
                <Eyebrow>
                    <Trans>Message</Trans>
                </Eyebrow>
                <textarea
                    value={binding.text}
                    rows={2}
                    spellCheck={false}
                    maxLength={OSC_LIMITS.maxTemplateLength}
                    placeholder={_(msg`e.g. ✦ Boss fight in ${gameToken}!`)}
                    aria-label={_(msg`Chatbox message`)}
                    className={cn(
                        INPUT_CLASS,
                        'h-auto min-h-16 resize-none py-2 font-mono text-[12.5px]',
                    )}
                    onInput={(event) => onChange({ text: event.currentTarget.value })}
                />
            </div>
        );
    }

    if (binding.action === EOscAction.Launch) {
        return (
            <select
                aria-label={_(msg`Game to launch`)}
                className={cn(INPUT_CLASS, 'appearance-none')}
                value={binding.launchGameId ?? ''}
                onChange={(event) =>
                    onChange({ launchGameId: event.currentTarget.value || null }, true)
                }
            >
                <option value="">{_(msg`Choose a game…`)}</option>
                {launchableGames.map((game) => (
                    <option key={game.gameId} value={game.gameId}>
                        {game.title}
                    </option>
                ))}
            </select>
        );
    }

    return null;
};

const NumberCommit = ({
    label,
    value,
    onCommit,
}: {
    label: string;
    value: number;
    onCommit: (value: number) => void;
}) => {
    return (
        <div>
            <Eyebrow>{label}</Eyebrow>
            <CommitInput
                mono
                inputMode="decimal"
                value={String(value)}
                label={label}
                onCommit={(raw) => {
                    const parsed = Number(raw.replace(',', '.'));
                    if (!raw.trim() || !Number.isFinite(parsed)) return false;
                    onCommit(parsed);
                    return true;
                }}
            />
        </div>
    );
};
