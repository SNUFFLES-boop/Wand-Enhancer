import {
    isNumericCheat,
    isOptionCheat,
    isPressCheat,
    numericRange,
    optionLabel,
} from '../../../protocol/cheat-kinds';
import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import {
    createOscBinding,
    EOscAction,
    OSC_LIMITS,
    type OscActivityEntry,
    type OscBinding,
} from '../../../protocol/osc';

export const BINDING_ACTIONS: EOscAction[] = [
    EOscAction.Toggle,
    EOscAction.Hold,
    EOscAction.Set,
    EOscAction.Press,
    EOscAction.Fixed,
    EOscAction.Step,
    EOscAction.Panic,
    EOscAction.Chatbox,
    EOscAction.Launch,
    EOscAction.Stop,
];

const CHEAT_ACTIONS = new Set<EOscAction>([
    EOscAction.Set,
    EOscAction.Hold,
    EOscAction.Toggle,
    EOscAction.Fixed,
    EOscAction.Step,
    EOscAction.Press,
]);

export function actionNeedsCheat(action: EOscAction): boolean {
    return CHEAT_ACTIONS.has(action);
}

export function isCheatCompatible(action: EOscAction, cheat: CheatSchema): boolean {
    switch (action) {
        case EOscAction.Hold:
        case EOscAction.Toggle:
            return cheat.type === ECheatType.Toggle || isPressCheat(cheat);
        case EOscAction.Step:
            return isNumericCheat(cheat) || isOptionCheat(cheat);
        case EOscAction.Press:
            return isPressCheat(cheat);
        case EOscAction.Set:
        case EOscAction.Fixed:
            return true;
        default:
            return false;
    }
}

/** A sensible action for a cheat when the user picks it first. */
export function defaultActionFor(cheat: CheatSchema): EOscAction {
    if (cheat.type === ECheatType.Toggle) return EOscAction.Toggle;
    if (isPressCheat(cheat)) return EOscAction.Press;
    return EOscAction.Set;
}

/** Short description of what a cheat accepts, e.g. "0 – 10", "on / off", "Sun · Rain". */
export function describeCheatInput(cheat: CheatSchema): string {
    if (cheat.type === ECheatType.Toggle) return 'on / off';
    if (isPressCheat(cheat)) return 'trigger';
    if (isNumericCheat(cheat)) {
        const { min, max } = numericRange(cheat);
        return `${min} – ${max}${cheat.args.postfix ?? ''}`;
    }
    if (isOptionCheat(cheat)) {
        const labels = (cheat.args.options ?? []).map(optionLabel);
        return labels.length > 4
            ? `${labels.slice(0, 3).join(' · ')} +${labels.length - 3}`
            : labels.join(' · ');
    }
    return cheat.type;
}

export function avatarParameterAddress(cheatName: string): string {
    const pascal = cheatName
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join('');
    return `/avatar/parameters/Wand${pascal || 'Mod'}`;
}

/**
 * One VRChat avatar parameter per mod: bools hold toggles, floats (0..1) drive ranges, and
 * buttons fire. Bindings match by name, so the same avatar works across every trainer.
 */
export function generateAvatarBindings(
    cheats: CheatSchema[],
    existing: OscBinding[],
): OscBinding[] {
    const taken = new Set(existing.map((binding) => binding.address));
    const room = Math.max(0, OSC_LIMITS.maxBindings - existing.length);
    const created: OscBinding[] = [];

    for (const cheat of cheats) {
        if (created.length >= room) break;
        const address = avatarParameterAddress(cheat.name);
        if (taken.has(address)) continue;

        let action: EOscAction | null = null;
        if (cheat.type === ECheatType.Toggle) action = EOscAction.Hold;
        else if (isPressCheat(cheat)) action = EOscAction.Press;
        else if (isNumericCheat(cheat) || isOptionCheat(cheat)) action = EOscAction.Set;
        if (!action) continue;

        taken.add(address);
        created.push(
            createOscBinding({
                address,
                action,
                target: cheat.target,
                cheatName: cheat.name,
                rescale: action === EOscAction.Set,
                feedback: action !== EOscAction.Press,
            }),
        );
    }

    return created;
}

/** Turns a message seen in the monitor into a binding shaped like what was sent. */
export function bindingFromActivity(
    entry: Pick<OscActivityEntry, 'address' | 'args'>,
    cheats: CheatSchema[],
    gameId: string | null,
): OscBinding {
    const type = entry.args[0]?.type;
    const continuous = type === 'f' || type === 'd';
    const boolean = type === 'T' || type === 'F';
    const action = continuous ? EOscAction.Set : boolean ? EOscAction.Hold : EOscAction.Toggle;
    const cheat =
        cheats.find((candidate) =>
            continuous ? isNumericCheat(candidate) : candidate.type === ECheatType.Toggle,
        ) ?? null;

    return createOscBinding({
        address: entry.address,
        action,
        scope: gameId,
        target: cheat?.target ?? null,
        cheatName: cheat?.name ?? null,
        rescale: continuous,
        feedback: true,
    });
}

export function newBinding(cheats: CheatSchema[], gameId: string | null): OscBinding {
    const cheat = cheats.find((candidate) => candidate.type === ECheatType.Toggle) ?? cheats[0];
    return createOscBinding({
        address: cheat ? avatarParameterAddress(cheat.name) : '/avatar/parameters/WandToggle',
        action: cheat ? defaultActionFor(cheat) : EOscAction.Toggle,
        scope: gameId,
        target: cheat?.target ?? null,
        cheatName: cheat?.name ?? null,
    });
}
