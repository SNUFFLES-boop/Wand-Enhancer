// Chatbox templates are rendered by the bridge (what VRChat receives) and by the panel (live
// preview while editing), so both sides share this one implementation.
import {
    type CheatSchema,
    ECheatType,
    type GameStatusPayload,
    type TrainerMetaPayload,
} from './messages';
import { OSC_LIMITS } from './osc';

export const CHATBOX_TOKENS = [
    'game',
    'version',
    'mods_on',
    'mods_total',
    'mods_list',
    'mods_bar',
    'last_mod',
    'last_value',
    'session',
    'time',
    'time12',
    'date',
    'uptime',
] as const;

export type ChatboxToken = (typeof CHATBOX_TOKENS)[number];

/** `{value:<target>}` prints one cheat's current value. */
export const CHATBOX_VALUE_TOKEN = 'value';

export interface ChatboxContext {
    active: boolean;
    game: string | null;
    version: string | null;
    modsOn: number;
    modsTotal: number;
    modsList: string[];
    lastMod: string | null;
    lastValue: string | null;
    sessionSeconds: number | null;
    uptimeSeconds: number;
    now: Date;
    values: Record<string, string>;
}

export type ChatboxContextInput = {
    trainerMeta: TrainerMetaPayload | null;
    values: Record<string, unknown>;
    gameStatus: GameStatusPayload | null;
    lastChange: { target: string; value: unknown } | null;
    uptimeSeconds: number;
    now: Date;
};

const TOKEN_PATTERN = /\{([a-z0-9_]+)(?::([^{}]+))?\}/gi;
const BAR_SEGMENTS = 8;

export function buildChatboxContext({
    trainerMeta,
    values,
    gameStatus,
    lastChange,
    uptimeSeconds,
    now,
}: ChatboxContextInput): ChatboxContext {
    const cheats = trainerMeta?.schema.cheats ?? [];
    const enabled = cheats.filter(
        (cheat) => cheat.type === ECheatType.Toggle && Boolean(values[cheat.target]),
    );
    const lastCheat = lastChange
        ? cheats.find((cheat) => cheat.target === lastChange.target)
        : undefined;
    const session = gameStatus?.session;
    const sessionRunning = session?.state === 'running';
    const formattedValues: Record<string, string> = {};
    for (const cheat of cheats) {
        formattedValues[cheat.target] = formatChatboxValue(cheat, values[cheat.target]);
    }

    return {
        active: Boolean(trainerMeta) || sessionRunning || gameStatus?.trainer.state === 'running',
        game:
            (sessionRunning ? session?.titleName : null) ||
            trainerMeta?.trainer.displayName ||
            gameStatus?.trainer.displayName ||
            null,
        version: trainerMeta?.trainer.gameVersion ?? null,
        modsOn: enabled.length,
        modsTotal: cheats.length,
        modsList: enabled.map((cheat) => cheat.name),
        lastMod: lastCheat?.name ?? null,
        lastValue: lastCheat && lastChange ? formatChatboxValue(lastCheat, lastChange.value) : null,
        sessionSeconds: sessionRunning ? resolveSessionSeconds(session, now) : null,
        uptimeSeconds,
        now,
        values: formattedValues,
    };
}

/** Renders a template and fits it to VRChat's chatbox limits. Unknown tokens are kept verbatim. */
export function renderChatboxTemplate(template: string, context: ChatboxContext): string {
    const rendered = template.replace(TOKEN_PATTERN, (match, rawName: string, arg?: string) => {
        const name = rawName.toLowerCase();
        if (name === CHATBOX_VALUE_TOKEN && arg) {
            return context.values[arg.trim()] ?? '—';
        }
        const value = resolveToken(name, context);
        return value ?? match;
    });

    return fitChatbox(rendered);
}

export function fitChatbox(text: string): string {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+$/, ''));
    while (lines.length > 0 && !lines[lines.length - 1]) {
        lines.pop();
    }

    const joined = lines.slice(0, OSC_LIMITS.chatboxMaxLines).join('\n');
    const chars = Array.from(joined);
    if (chars.length <= OSC_LIMITS.chatboxMaxChars) {
        return joined;
    }

    return `${chars.slice(0, OSC_LIMITS.chatboxMaxChars - 1).join('')}…`;
}

export function chatboxLength(text: string): number {
    return Array.from(text).length;
}

export function formatChatboxValue(
    cheat: Pick<CheatSchema, 'type' | 'args'>,
    value: unknown,
): string {
    if (cheat.type === ECheatType.Toggle) {
        return value ? 'ON' : 'OFF';
    }
    if (cheat.type === ECheatType.Button) {
        return 'FIRED';
    }
    if (cheat.type === ECheatType.Selection) {
        const option = cheat.args.options?.find((entry) =>
            typeof entry === 'object'
                ? String(entry.value) === String(value)
                : String(entry) === String(value),
        );
        if (option && typeof option === 'object' && option.label) {
            return option.label;
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.round(value * 100) / 100;
        return `${rounded.toLocaleString('en-US')}${cheat.args.postfix ?? ''}`;
    }
    if (value === null || value === undefined || value === '') {
        return '—';
    }
    return String(value);
}

export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

function resolveToken(name: string, context: ChatboxContext): string | null {
    switch (name as ChatboxToken) {
        case 'game':
            return context.game ?? 'Wand';
        case 'version':
            return context.version ?? '';
        case 'mods_on':
            return String(context.modsOn);
        case 'mods_total':
            return String(context.modsTotal);
        case 'mods_list':
            return context.modsList.join(', ');
        case 'mods_bar':
            return progressBar(context.modsOn, context.modsTotal);
        case 'last_mod':
            return context.lastMod ?? '';
        case 'last_value':
            return context.lastValue ?? '';
        case 'session':
            return context.sessionSeconds === null ? '' : formatDuration(context.sessionSeconds);
        case 'time':
            return `${pad2(context.now.getHours())}:${pad2(context.now.getMinutes())}`;
        case 'time12': {
            const hours = context.now.getHours();
            return `${hours % 12 || 12}:${pad2(context.now.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`;
        }
        case 'date':
            return `${context.now.getFullYear()}-${pad2(context.now.getMonth() + 1)}-${pad2(context.now.getDate())}`;
        case 'uptime':
            return formatDuration(context.uptimeSeconds);
        default:
            return null;
    }
}

function progressBar(on: number, total: number): string {
    const filled = total > 0 ? Math.round((on / total) * BAR_SEGMENTS) : 0;
    return '▰'.repeat(filled) + '▱'.repeat(BAR_SEGMENTS - filled);
}

function resolveSessionSeconds(session: GameStatusPayload['session'] | undefined, now: Date) {
    const startedAt = session?.startedAt ? Date.parse(session.startedAt) : Number.NaN;
    if (Number.isFinite(startedAt)) {
        return Math.max(0, (now.getTime() - startedAt) / 1000);
    }
    return session?.sessionDurationSeconds ?? 0;
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}
