// How a cheat behaves as an input, shared by the bridge's OSC bot and the panel's binding
// editor. Wand models a one-shot action either as a button or an option-less incremental.
import { type CheatOptionLike, type CheatSchema, ECheatType } from './messages';

export function optionValues(cheat: Pick<CheatSchema, 'args'>): (string | number)[] {
    return (cheat.args.options ?? []).map(optionValue);
}

export function optionValue(option: CheatOptionLike): string | number {
    return typeof option === 'object' ? option.value : option;
}

export function optionLabel(option: CheatOptionLike): string {
    return typeof option === 'object' && option.label ? option.label : String(optionValue(option));
}

export function isPressCheat(cheat: Pick<CheatSchema, 'type' | 'args'>): boolean {
    return (
        cheat.type === ECheatType.Button ||
        (cheat.type === ECheatType.Incremental && optionValues(cheat).length === 0)
    );
}

export function isNumericCheat(cheat: Pick<CheatSchema, 'type'>): boolean {
    return (
        cheat.type === ECheatType.Slider ||
        cheat.type === ECheatType.Number ||
        cheat.type === ECheatType.Scalar
    );
}

export function isOptionCheat(cheat: Pick<CheatSchema, 'type' | 'args'>): boolean {
    return (
        cheat.type === ECheatType.Selection ||
        (cheat.type === ECheatType.Incremental && optionValues(cheat).length > 0)
    );
}

export type NumericRange = { min: number; max: number; step: number };

/** Range of a numeric cheat; scalars without min/max derive it from their option values. */
export function numericRange(cheat: Pick<CheatSchema, 'args'>): NumericRange {
    const numericOptions = optionValues(cheat)
        .map((option) => Number(option))
        .filter((option) => Number.isFinite(option))
        .sort((left, right) => left - right);
    const min = cheat.args.min ?? numericOptions[0] ?? 0;
    const max = cheat.args.max ?? numericOptions[numericOptions.length - 1] ?? min + 100;
    return { min, max: Math.max(min, max), step: cheat.args.step ?? 0 };
}
