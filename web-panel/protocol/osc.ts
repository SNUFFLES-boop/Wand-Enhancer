// OSC bot vocabulary shared by the bridge (which runs the bot inside Wand) and the panel
// (which edits it). The bridge persists `OscBotConfig` to disk, so string values on the
// right-hand side of these enums are a storage format: do not rename them.

export enum EOscAction {
    /** Write the incoming argument to the cheat, optionally rescaled to its range. */
    Set = 'set',
    /** Toggle cheat follows the argument: on while it is truthy. */
    Hold = 'hold',
    /** Flip a toggle cheat on every trigger. */
    Toggle = 'toggle',
    /** Write a configured value on every trigger. */
    Fixed = 'fixed',
    /** Add a configured amount to a numeric cheat on every trigger. */
    Step = 'step',
    /** Fire a one-shot button cheat. */
    Press = 'press',
    /** Turn every toggle off. */
    Panic = 'panic',
    /** Launch the trainer for a game. */
    Launch = 'launch',
    /** End the running trainer. */
    Stop = 'stop',
    /** Send a chatbox message (supports template tokens). */
    Chatbox = 'chatbox',
}

export enum EOscBotState {
    Disabled = 'disabled',
    Starting = 'starting',
    Listening = 'listening',
    /** The listen port is taken; output (chatbox, feedback) still works. */
    SendOnly = 'send_only',
    Error = 'error',
}

export enum EOscDirection {
    In = 'in',
    Out = 'out',
    Error = 'error',
    Info = 'info',
}

export interface OscTarget {
    id: string;
    name: string;
    host: string;
    port: number;
    enabled: boolean;
    /** Receives `/chatbox/input` and `/chatbox/typing`. */
    chatbox: boolean;
    /** Receives the `<prefix>/...` state mirror (values, game, mod counts). */
    state: boolean;
    /** Receives binding feedback: a bound cheat's value echoed to the binding address. */
    bindings: boolean;
}

export interface OscBinding {
    id: string;
    enabled: boolean;
    address: string;
    action: EOscAction;
    /** Game the binding is limited to; null applies to every game, matching the cheat by name. */
    scope: string | null;
    target: string | null;
    cheatName: string | null;
    /** Fixed: the value to write. Step: the amount to add (negative steps down). */
    value: string | number;
    /** Chatbox: the message template. */
    text: string;
    launchGameId: string | null;
    rescale: boolean;
    inputMin: number;
    inputMax: number;
    feedback: boolean;
}

export interface OscChatboxConfig {
    enabled: boolean;
    intervalSeconds: number;
    /** Rotated while a game or trainer is active. Templates that render empty are skipped. */
    messages: string[];
    /** Shown while idle; empty clears the chatbox once and stays quiet. */
    idleMessage: string;
    announceChanges: boolean;
    announceTemplate: string;
    notifySound: boolean;
    typingIndicator: boolean;
}

export interface OscBotConfig {
    enabled: boolean;
    listenPort: number;
    /** Listen on every interface instead of loopback, so phones/tablets can send OSC. */
    allowLan: boolean;
    prefix: string;
    /** Expose every cheat at `<prefix>/cheat/<target>` without a binding. */
    autoMap: boolean;
    /** Coalesce continuous writes (faders) to one per target per window. */
    throttleMs: number;
    targets: OscTarget[];
    bindings: OscBinding[];
    chatbox: OscChatboxConfig;
}

export type OscArgPreview = {
    type: string;
    value: string | number | boolean | null;
};

export interface OscActivityEntry {
    id: number;
    at: number;
    direction: EOscDirection;
    address: string;
    args: OscArgPreview[];
    peer: string;
    /** Identical consecutive messages are folded into one entry. */
    count: number;
    bindingId?: string | null;
    /** What the bot did with the message, or why it could not act on it. */
    note?: string | null;
    failed?: boolean;
}

export interface OscTrafficSample {
    in: number;
    out: number;
}

export interface OscBotStatus {
    state: EOscBotState;
    listenAddress: string | null;
    error: string | null;
    startedAt: string | null;
    packetsIn: number;
    packetsOut: number;
    errors: number;
    /** Packets per second, oldest first. */
    history: OscTrafficSample[];
    lastChatbox: string | null;
    lastChatboxAt: string | null;
}

export const OSC_LIMITS = Object.freeze({
    maxBindings: 128,
    maxTargets: 8,
    maxMessages: 12,
    maxTemplateLength: 512,
    maxAddressLength: 256,
    chatboxMaxChars: 144,
    chatboxMaxLines: 9,
    minIntervalSeconds: 2,
    maxIntervalSeconds: 60,
    maxThrottleMs: 1000,
    historySeconds: 60,
    /** VRChat drops chatbox messages that arrive faster than this. */
    chatboxMinSpacingMs: 1600,
});

export const OSC_VRCHAT_DEFAULTS = Object.freeze({
    host: '127.0.0.1',
    /** VRChat listens here. */
    inputPort: 9000,
    /** VRChat sends avatar parameters here. */
    outputPort: 9001,
});

export function createDefaultOscConfig(): OscBotConfig {
    return {
        enabled: false,
        listenPort: OSC_VRCHAT_DEFAULTS.outputPort,
        allowLan: false,
        prefix: '/wand',
        autoMap: true,
        throttleMs: 40,
        targets: [createVrchatTarget()],
        bindings: [],
        chatbox: {
            enabled: true,
            intervalSeconds: 6,
            messages: [
                '▶ {game}\n✦ {mods_on}/{mods_total} mods active',
                '◷ {session} played · {time}',
            ],
            idleMessage: '',
            announceChanges: true,
            announceTemplate: '✦ {last_mod}: {last_value}',
            notifySound: false,
            typingIndicator: false,
        },
    };
}

export function createVrchatTarget(id = 'vrchat'): OscTarget {
    return {
        id,
        name: 'VRChat',
        host: OSC_VRCHAT_DEFAULTS.host,
        port: OSC_VRCHAT_DEFAULTS.inputPort,
        enabled: true,
        chatbox: true,
        state: false,
        bindings: true,
    };
}

export function createOscBinding(partial: Partial<OscBinding> = {}): OscBinding {
    return {
        id: createOscId('b'),
        enabled: true,
        address: '/avatar/parameters/WandToggle',
        action: EOscAction.Toggle,
        scope: null,
        target: null,
        cheatName: null,
        value: 1,
        text: '',
        launchGameId: null,
        rescale: false,
        inputMin: 0,
        inputMax: 1,
        feedback: false,
        ...partial,
    };
}

let idSequence = 0;

export function createOscId(prefix: string): string {
    idSequence = (idSequence + 1) % 1_000_000;
    return `${prefix}${Date.now().toString(36)}${idSequence.toString(36)}`;
}

const OSC_ACTIONS = new Set<string>(Object.values(EOscAction));
// Commas stay legal: `{a,b}` is an OSC address pattern alternation.
const ADDRESS_PATTERN = /^\/[^\s#]*$/;
const HOST_PATTERN = /^[A-Za-z0-9.:\-[\]]+$/;

export function isValidOscAddress(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= OSC_LIMITS.maxAddressLength &&
        ADDRESS_PATTERN.test(value)
    );
}

export function isValidOscHost(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 253 && HOST_PATTERN.test(value);
}

/**
 * Parses an untrusted config (disk file, websocket payload, pasted backup) into a complete
 * config. Invalid entries are dropped or replaced by defaults rather than rejected, so one
 * bad binding never discards a whole profile.
 */
export function normalizeOscConfig(raw: unknown): OscBotConfig {
    const defaults = createDefaultOscConfig();
    if (!isObject(raw)) {
        return defaults;
    }

    const seenIds = new Set<string>();
    const uniqueId = (value: unknown, prefix: string) => {
        let id = typeof value === 'string' ? value.trim().slice(0, 64) : '';
        if (!id || seenIds.has(id)) {
            id = createOscId(prefix);
        }
        seenIds.add(id);
        return id;
    };

    const targets = Array.isArray(raw.targets)
        ? raw.targets
              .filter(isObject)
              .filter((entry) => isValidOscHost(entry.host) && isPort(entry.port))
              .slice(0, OSC_LIMITS.maxTargets)
              .map(
                  (entry): OscTarget => ({
                      id: uniqueId(entry.id, 't'),
                      name: text(entry.name, 32) || String(entry.host),
                      host: String(entry.host),
                      port: Number(entry.port),
                      enabled: bool(entry.enabled, true),
                      chatbox: bool(entry.chatbox, false),
                      state: bool(entry.state, false),
                      bindings: bool(entry.bindings, false),
                  }),
              )
        : defaults.targets;

    const bindings = Array.isArray(raw.bindings)
        ? raw.bindings
              .filter(isObject)
              .filter(
                  (entry) =>
                      isValidOscAddress(entry.address) && OSC_ACTIONS.has(String(entry.action)),
              )
              .slice(0, OSC_LIMITS.maxBindings)
              .map(
                  (entry): OscBinding => ({
                      id: uniqueId(entry.id, 'b'),
                      enabled: bool(entry.enabled, true),
                      address: String(entry.address),
                      action: entry.action as EOscAction,
                      scope: nullableText(entry.scope, 128),
                      target: nullableText(entry.target, 256),
                      cheatName: nullableText(entry.cheatName, 128),
                      value:
                          typeof entry.value === 'number' && Number.isFinite(entry.value)
                              ? entry.value
                              : text(entry.value, 128) || 1,
                      text: text(entry.text, OSC_LIMITS.maxTemplateLength, true),
                      launchGameId: nullableText(entry.launchGameId, 128),
                      rescale: bool(entry.rescale, false),
                      inputMin: finite(entry.inputMin, 0),
                      inputMax: finite(entry.inputMax, 1),
                      feedback: bool(entry.feedback, false),
                  }),
              )
        : [];

    const chatboxRaw = isObject(raw.chatbox) ? raw.chatbox : {};
    const messages = Array.isArray(chatboxRaw.messages)
        ? chatboxRaw.messages
              .filter((entry): entry is string => typeof entry === 'string')
              .slice(0, OSC_LIMITS.maxMessages)
              .map((entry) => entry.slice(0, OSC_LIMITS.maxTemplateLength))
        : defaults.chatbox.messages;

    return {
        enabled: bool(raw.enabled, defaults.enabled),
        listenPort: isPort(raw.listenPort) ? Number(raw.listenPort) : defaults.listenPort,
        allowLan: bool(raw.allowLan, defaults.allowLan),
        prefix: normalizePrefix(raw.prefix, defaults.prefix),
        autoMap: bool(raw.autoMap, defaults.autoMap),
        throttleMs: clamp(
            Math.round(finite(raw.throttleMs, defaults.throttleMs)),
            0,
            OSC_LIMITS.maxThrottleMs,
        ),
        targets,
        bindings,
        chatbox: {
            enabled: bool(chatboxRaw.enabled, defaults.chatbox.enabled),
            intervalSeconds: clamp(
                Math.round(finite(chatboxRaw.intervalSeconds, defaults.chatbox.intervalSeconds)),
                OSC_LIMITS.minIntervalSeconds,
                OSC_LIMITS.maxIntervalSeconds,
            ),
            messages,
            idleMessage:
                typeof chatboxRaw.idleMessage === 'string'
                    ? chatboxRaw.idleMessage.slice(0, OSC_LIMITS.maxTemplateLength)
                    : defaults.chatbox.idleMessage,
            announceChanges: bool(chatboxRaw.announceChanges, defaults.chatbox.announceChanges),
            announceTemplate:
                typeof chatboxRaw.announceTemplate === 'string'
                    ? chatboxRaw.announceTemplate.slice(0, OSC_LIMITS.maxTemplateLength)
                    : defaults.chatbox.announceTemplate,
            notifySound: bool(chatboxRaw.notifySound, defaults.chatbox.notifySound),
            typingIndicator: bool(chatboxRaw.typingIndicator, defaults.chatbox.typingIndicator),
        },
    };
}

/** `<prefix>/cheat/<slug>` alias for a cheat name, e.g. "Infinite Health" -> infinite_health. */
export function slugifyCheatName(name: string): string {
    return name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizePrefix(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim().replace(/\/+$/, '');
    return isValidOscAddress(trimmed) && trimmed.length > 1 && trimmed.length <= 64
        ? trimmed
        : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPort(value: unknown): boolean {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536;
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function text(value: unknown, max: number, keepWhitespace = false): string {
    if (typeof value !== 'string') {
        return '';
    }
    return (keepWhitespace ? value : value.trim()).slice(0, max);
}

function nullableText(value: unknown, max: number): string | null {
    return text(value, max) || null;
}
