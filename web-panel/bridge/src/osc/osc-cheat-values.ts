import {
    isNumericCheat,
    isOptionCheat,
    isPressCheat,
    type NumericRange,
    numericRange,
    optionLabel,
    optionValue,
    optionValues,
} from '../../../protocol/cheat-kinds';
import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import type { OscArg } from './osc-codec';

/**
 * Translation between OSC arguments and Wand cheat values. OSC controllers speak floats,
 * ints, booleans and strings; cheats speak toggles, ranges, option lists and one-shot
 * buttons. Every function returns null when an argument cannot drive the cheat.
 */

export type CheatWriteValue = boolean | number | string;

export type InputRange = { inputMin: number; inputMax: number };

export function isTriggered(args: OscArg[]): boolean {
    return args.length === 0 || argTruthy(args[0]);
}

export function argTruthy(arg: OscArg): boolean {
    switch (arg.type) {
        case 'T':
        case 'I':
            return true;
        case 'F':
        case 'N':
            return false;
        case 'f':
        case 'd':
            return arg.value >= 0.5;
        case 'i':
        case 'h':
        case 'r':
        case 't':
            return arg.value !== 0;
        case 's':
        case 'S':
        case 'c':
            return !['', '0', 'false', 'off', 'no'].includes(arg.value.trim().toLowerCase());
        default:
            return arg.value.length > 0;
    }
}

export function argNumber(arg: OscArg | undefined): number | null {
    if (!arg) {
        return null;
    }
    if (typeof arg.value === 'number') {
        return Number.isFinite(arg.value) ? arg.value : null;
    }
    if (typeof arg.value === 'boolean') {
        return arg.value ? 1 : 0;
    }
    if (typeof arg.value === 'string' && arg.value.trim()) {
        const parsed = Number(arg.value.replace(/[\s,_]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** Converts the first argument into a value for the cheat (Set semantics). */
export function valueFromArgs(
    cheat: CheatSchema,
    args: OscArg[],
    rescale: InputRange | null,
): CheatWriteValue | null {
    if (cheat.type === ECheatType.Toggle) {
        return args.length > 0 ? argTruthy(args[0]) : null;
    }
    if (isPressCheat(cheat)) {
        return isTriggered(args) ? 1 : null;
    }

    const first = args[0];
    if (isNumericCheat(cheat)) {
        const raw = argNumber(first);
        if (raw === null) {
            return null;
        }
        const range = numericRange(cheat);
        const value = rescale ? range.min + unit(raw, rescale) * (range.max - range.min) : raw;
        return snap(value, range);
    }

    if (isOptionCheat(cheat)) {
        const options = optionValues(cheat);
        if (first && (first.type === 's' || first.type === 'S')) {
            return matchOption(cheat, first.value);
        }
        const raw = argNumber(first);
        if (raw === null || options.length === 0) {
            return null;
        }
        if (rescale) {
            return options[Math.round(unit(raw, rescale) * (options.length - 1))];
        }
        const exact = options.find((option) => String(option) === String(raw));
        return exact ?? options[clamp(Math.round(raw), 0, options.length - 1)];
    }

    return null;
}

/** Fixed action: the configured value coerced to the cheat's type. */
export function fixedValue(cheat: CheatSchema, raw: string | number): CheatWriteValue | null {
    if (cheat.type === ECheatType.Toggle) {
        return typeof raw === 'number' ? raw !== 0 : argTruthy({ type: 's', value: String(raw) });
    }
    if (isPressCheat(cheat)) {
        return 1;
    }
    if (isNumericCheat(cheat)) {
        const value = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(value) ? snap(value, numericRange(cheat)) : null;
    }
    if (isOptionCheat(cheat)) {
        const options = optionValues(cheat);
        return (
            matchOption(cheat, String(raw)) ??
            (typeof raw === 'number'
                ? (options[clamp(Math.round(raw), 0, options.length - 1)] ?? null)
                : null)
        );
    }
    return null;
}

/** Step action: moves a range by `amount`, or an option list by whole entries. */
export function stepValue(
    cheat: CheatSchema,
    current: unknown,
    amount: number,
): CheatWriteValue | null {
    if (!Number.isFinite(amount) || amount === 0) {
        return null;
    }
    if (isNumericCheat(cheat)) {
        const range = numericRange(cheat);
        const base = typeof current === 'number' && Number.isFinite(current) ? current : range.min;
        return snap(base + amount, range);
    }
    if (isOptionCheat(cheat)) {
        const options = optionValues(cheat);
        if (options.length === 0) {
            return null;
        }
        const index = options.findIndex((option) => String(option) === String(current));
        const delta = Math.sign(amount) * Math.max(1, Math.round(Math.abs(amount)));
        return options[clamp((index < 0 ? -1 : index) + delta, 0, options.length - 1)];
    }
    return null;
}

/** The step a bare `inc`/`dec` uses: the cheat's own step, else 1. */
export function defaultStep(cheat: CheatSchema): number {
    return numericRange(cheat).step || 1;
}

/** Echo of a cheat value back to a controller, shaped like what that controller sends. */
export function feedbackArgs(
    cheat: CheatSchema,
    value: unknown,
    learnedType: string | undefined,
    rescale: InputRange | null,
): OscArg[] | null {
    if (isPressCheat(cheat)) {
        return null;
    }

    if (cheat.type === ECheatType.Toggle) {
        const on = Boolean(value);
        if (learnedType === 'i') return [{ type: 'i', value: on ? 1 : 0 }];
        if (learnedType === 'f') return [{ type: 'f', value: on ? 1 : 0 }];
        return [on ? { type: 'T', value: true } : { type: 'F', value: false }];
    }

    let numeric: number | null = null;
    if (isNumericCheat(cheat)) {
        numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
        if (numeric !== null && rescale) {
            const range = numericRange(cheat);
            const t = range.max === range.min ? 0 : (numeric - range.min) / (range.max - range.min);
            numeric = rescale.inputMin + clamp(t, 0, 1) * (rescale.inputMax - rescale.inputMin);
        }
    } else if (isOptionCheat(cheat)) {
        const options = optionValues(cheat);
        const index = options.findIndex((option) => String(option) === String(value));
        if (index < 0) return null;
        if (learnedType === 's') return [{ type: 's', value: String(options[index]) }];
        numeric =
            rescale && options.length > 1
                ? rescale.inputMin +
                  (index / (options.length - 1)) * (rescale.inputMax - rescale.inputMin)
                : index;
    }

    if (numeric === null) {
        return null;
    }
    return learnedType === 'i'
        ? [{ type: 'i', value: Math.round(numeric) }]
        : [{ type: 'f', value: numeric }];
}

/** The `<prefix>/cheat/<target>` state mirror: 1/0 for toggles, floats, option values as text. */
export function stateArgs(cheat: CheatSchema, value: unknown): OscArg[] | null {
    if (isPressCheat(cheat)) {
        return null;
    }
    if (cheat.type === ECheatType.Toggle) {
        return [{ type: 'i', value: value ? 1 : 0 }];
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return [{ type: 'f', value }];
    }
    if (value === null || value === undefined) {
        return null;
    }
    return [{ type: 's', value: String(value) }];
}

export function sameValue(left: unknown, right: unknown): boolean {
    if (typeof left === 'boolean' || typeof right === 'boolean') {
        return Boolean(left) === Boolean(right);
    }
    return left !== undefined && left !== null && String(left) === String(right);
}

function matchOption(cheat: CheatSchema, raw: string): string | number | null {
    const needle = raw.trim().toLowerCase();
    for (const option of cheat.args.options ?? []) {
        const value = optionValue(option);
        const label = optionLabel(option);
        if (String(value).toLowerCase() === needle || label.toLowerCase() === needle) {
            return value;
        }
    }
    return null;
}

function snap(value: number, range: NumericRange): number {
    const clamped = clamp(value, range.min, range.max);
    if (!range.step) {
        return Math.round(clamped * 10000) / 10000;
    }
    const steps = Math.round((clamped - range.min) / range.step);
    const decimals = (String(range.step).split('.')[1] ?? '').length;
    return Number(clamp(range.min + steps * range.step, range.min, range.max).toFixed(decimals));
}

function unit(value: number, range: InputRange): number {
    const span = range.inputMax - range.inputMin;
    return span === 0 ? 0 : clamp((value - range.inputMin) / span, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
