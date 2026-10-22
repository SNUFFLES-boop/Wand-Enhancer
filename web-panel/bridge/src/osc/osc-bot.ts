import dgram from 'node:dgram';
import {
    buildChatboxContext,
    type ChatboxContext,
    formatChatboxValue,
    renderChatboxTemplate,
} from '../../../protocol/chatbox-template';
import { isNumericCheat, isPressCheat } from '../../../protocol/cheat-kinds';
import {
    type CheatSchema,
    ECheatType,
    type GameStatusPayload,
    type InstalledAppSummary,
    type OscCommandPayload,
    type OscCommandResultPayload,
    type OscStatePayload,
    type RemoteCommandAction,
    type TrainerMetaPayload,
} from '../../../protocol/messages';
import {
    EOscAction,
    EOscBotState,
    EOscDirection,
    isValidOscAddress,
    normalizeOscConfig,
    OSC_LIMITS,
    type OscActivityEntry,
    type OscBinding,
    type OscBotConfig,
    type OscBotStatus,
    type OscTrafficSample,
    slugifyCheatName,
} from '../../../protocol/osc';
import type { LogFn } from '../types';
import {
    argNumber,
    type CheatWriteValue,
    defaultStep,
    feedbackArgs,
    fixedValue,
    isTriggered,
    sameValue,
    stateArgs,
    stepValue,
    valueFromArgs,
} from './osc-cheat-values';
import {
    argsFromPreviews,
    decodePacket,
    encodeMessage,
    isLiteralOscAddress,
    matchesOscAddress,
    type OscArg,
    type OscMessage,
    previewArgs,
} from './osc-codec';
import type { OscConfigStore } from './osc-config-store';

export type OscBotEvent =
    | { type: 'trainer' }
    | { type: 'value'; target: string; value: unknown }
    | { type: 'game_status' };

/** What the bot needs from the bridge. Writes go through the same path as panel writes. */
export type OscBotHost = {
    getTrainerMeta(): TrainerMetaPayload | null;
    getValues(): Record<string, unknown>;
    getGameStatus(): GameStatusPayload | null;
    getInstalledApps(): InstalledAppSummary[];
    setValue(target: string, value: unknown): Promise<boolean>;
    runCommand(action: RemoteCommandAction, gameId: string | null): Promise<boolean>;
};

export type UdpPeer = { address: string; port: number };

/** The slice of `dgram.Socket` the bot uses; injectable so tests run without real UDP. */
export type UdpSocketPort = {
    on(event: 'message', listener: (message: Buffer, peer: UdpPeer) => void): unknown;
    on(event: 'listening', listener: () => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    bind(port: number, address: string): unknown;
    send(
        message: Buffer,
        port: number,
        address: string,
        callback: (error: Error | null) => void,
    ): void;
    close(): void;
    unref?(): unknown;
};

export type OscBotPublishType = 'osc_state' | 'osc_status' | 'osc_activity';

type OscBotOptions = {
    host: OscBotHost;
    store: OscConfigStore;
    log: LogFn;
    publish(type: OscBotPublishType, payload: unknown, requestId?: string | null): void;
    createSocket?: () => UdpSocketPort;
};

type Outcome = { note: string; failed?: boolean } | null;

const ACTIVITY_LIMIT = 300;
const ACTIVITY_SNAPSHOT = 120;
const ACTIVITY_FLUSH_MS = 200;
const ACTIVITY_FOLD_WINDOW_MS = 1500;
const ACTIVITY_FOLD_LOOKBACK = 16;
const MAX_MESSAGES_PER_PACKET = 64;
const MAX_LEARNED_ADDRESSES = 512;
const OPTIMISTIC_VALUE_TTL_MS = 2000;
const TYPING_LEAD_MS = 700;
const CLOSE_GRACE_MS = 120;

export function createOscBot({
    host,
    store,
    log,
    publish,
    createSocket = defaultSocket,
}: OscBotOptions) {
    let config: OscBotConfig = store.load();
    let listenSocket: UdpSocketPort | null = null;
    let sendSocket: UdpSocketPort | null = null;
    let running = false;
    let closed = false;

    let state = EOscBotState.Disabled;
    let listenAddress: string | null = null;
    let lastError: string | null = null;
    let startedAt: number | null = null;
    let packetsIn = 0;
    let packetsOut = 0;
    let errors = 0;
    let history: OscTrafficSample[] = [];
    let bucket: OscTrafficSample = { in: 0, out: 0 };
    let lastStatusSignature = '';
    let statsTimer: ReturnType<typeof setInterval> | null = null;

    const activity: OscActivityEntry[] = [];
    const pendingActivity = new Map<number, OscActivityEntry>();
    let nextActivityId = 1;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const learnedArgTypes = new Map<string, string>();
    const optimisticValues = new Map<string, { value: unknown; at: number }>();
    const throttledWrites = new Map<
        string,
        {
            lastAt: number;
            pending: CheatWriteValue | null;
            timer: ReturnType<typeof setTimeout> | null;
        }
    >();
    let lastChange: { target: string; value: unknown } | null = null;

    let chatboxTimer: ReturnType<typeof setInterval> | null = null;
    let deliveryTimer: ReturnType<typeof setTimeout> | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingChatbox: { text: string; notify: boolean } | null = null;
    let rotationIndex = 0;
    let holdUntil = 0;
    let lastSentAt = Number.NEGATIVE_INFINITY;
    let lastSentText: string | null = null;
    let lastChatboxAt: number | null = null;

    // ---- lifecycle -------------------------------------------------------------------------

    function start() {
        stopTransport();
        if (closed || !config.enabled) {
            state = EOscBotState.Disabled;
            listenAddress = null;
            lastError = null;
            return;
        }

        running = true;
        startedAt = Date.now();
        state = EOscBotState.Starting;
        lastError = null;
        const bindHost = config.allowLan ? '0.0.0.0' : '127.0.0.1';
        const port = config.listenPort;

        try {
            sendSocket = createSocket();
            sendSocket.on('error', (error) => recordFailure('Send socket error.', error));
            sendSocket.unref?.();

            const socket = createSocket();
            listenSocket = socket;
            socket.on('listening', () => {
                if (listenSocket !== socket) return;
                state = EOscBotState.Listening;
                listenAddress = `${bindHost}:${port}`;
                log('info', `OSC bot listening on ${listenAddress}.`);
                publishStatus(true);
            });
            socket.on('message', (message, peer) => {
                if (listenSocket === socket) handlePacket(message, peer);
            });
            socket.on('error', (error) => {
                if (listenSocket !== socket) return;
                if (state === EOscBotState.Starting) {
                    // Another OSC app often owns the port; keep sending so the chatbox still works.
                    state = EOscBotState.SendOnly;
                    lastError = describeBindError(error, port);
                    listenSocket = null;
                    safeClose(socket);
                    log('warn', `OSC bot could not listen on ${bindHost}:${port}.`, error);
                    record({ direction: EOscDirection.Error, address: '', note: lastError });
                    publishStatus(true);
                    return;
                }
                recordFailure('Listen socket error.', error);
            });
            socket.unref?.();
            socket.bind(port, bindHost);
        } catch (error) {
            state = EOscBotState.Error;
            lastError = error instanceof Error ? error.message : String(error);
            log('warn', 'OSC bot failed to start.', error);
        }

        statsTimer = unref(setInterval(tickStats, 1000));
        scheduleChatbox();
        mirrorEverything();
    }

    function stopTransport() {
        const clearChatbox = running && Boolean(lastSentText) && sendSocket !== null;
        if (clearChatbox) {
            // Leave VRChat clean: a stopped bot must not strand its last message.
            sendChatboxInput('', false);
        }
        running = false;
        clearTimer(statsTimer, clearInterval);
        clearTimer(chatboxTimer, clearInterval);
        clearTimer(deliveryTimer, clearTimeout);
        clearTimer(typingTimer, clearTimeout);
        statsTimer = chatboxTimer = deliveryTimer = typingTimer = null;
        pendingChatbox = null;
        for (const write of throttledWrites.values()) {
            clearTimer(write.timer, clearTimeout);
        }
        throttledWrites.clear();

        const sockets = [listenSocket, sendSocket];
        listenSocket = sendSocket = null;
        if (clearChatbox) {
            unref(setTimeout(() => sockets.forEach(safeClose), CLOSE_GRACE_MS));
        } else {
            sockets.forEach(safeClose);
        }
        lastSentText = null;
        lastSentAt = Number.NEGATIVE_INFINITY;
        listenAddress = null;
        startedAt = null;
    }

    function applyConfig(next: OscBotConfig) {
        const previous = config;
        config = next;
        const transportChanged =
            previous.enabled !== next.enabled ||
            previous.listenPort !== next.listenPort ||
            previous.allowLan !== next.allowLan;

        if (transportChanged) {
            start();
            return;
        }
        if (!running) {
            return;
        }
        if (previous.chatbox.enabled && !next.chatbox.enabled && lastSentText) {
            queueChatbox('', false);
        }
        if (
            previous.chatbox.enabled !== next.chatbox.enabled ||
            previous.chatbox.intervalSeconds !== next.chatbox.intervalSeconds
        ) {
            scheduleChatbox();
        }
        if (
            previous.prefix !== next.prefix ||
            JSON.stringify(previous.targets) !== JSON.stringify(next.targets)
        ) {
            mirrorEverything();
        }
    }

    // ---- incoming --------------------------------------------------------------------------

    function handlePacket(buffer: Buffer, peer: UdpPeer) {
        packetsIn += 1;
        bucket.in += 1;
        const from = `${peer.address}:${peer.port}`;

        let messages: OscMessage[];
        try {
            messages = decodePacket(buffer);
        } catch (error) {
            errors += 1;
            record({
                direction: EOscDirection.Error,
                address: '',
                peer: from,
                note: `Malformed packet: ${error instanceof Error ? error.message : String(error)}`,
                failed: true,
            });
            return;
        }

        for (const message of messages.slice(0, MAX_MESSAGES_PER_PACKET)) {
            handleMessage(message, peer, from);
        }
    }

    function handleMessage(message: OscMessage, peer: UdpPeer, from: string) {
        if (message.args.length > 0) {
            learnArgType(message.address, message.args[0].type);
        }

        const outcomes: Outcome[] = [];
        let bindingId: string | null = null;
        for (const binding of config.bindings) {
            if (!binding.enabled || !matchesOscAddress(binding.address, message.address)) continue;
            if (!inScope(binding)) continue;
            bindingId ??= binding.id;
            outcomes.push(runBinding(binding, message.args));
        }
        if (config.autoMap) {
            outcomes.push(routeNamespace(message, peer));
        }

        const notes = outcomes.filter((outcome): outcome is NonNullable<Outcome> =>
            Boolean(outcome),
        );
        record({
            direction: EOscDirection.In,
            address: message.address,
            args: message.args,
            peer: from,
            bindingId,
            note: notes.map((outcome) => outcome.note).join(' · ') || null,
            failed: notes.length > 0 && notes.every((outcome) => outcome.failed),
        });
    }

    function runBinding(binding: OscBinding, args: OscArg[]): Outcome {
        switch (binding.action) {
            case EOscAction.Panic:
                return isTriggered(args) ? panic() : null;
            case EOscAction.Stop:
                return isTriggered(args) ? command('stop', currentGameId()) : null;
            case EOscAction.Launch:
                if (!isTriggered(args)) return null;
                return binding.launchGameId
                    ? command('launch', binding.launchGameId)
                    : fail('No game selected to launch');
            case EOscAction.Chatbox:
                if (!isTriggered(args)) return null;
                return announce(renderChatboxTemplate(binding.text, chatboxContext()))
                    ? { note: 'Chatbox message sent' }
                    : fail('Chatbox is not reachable');
            default:
                break;
        }

        const cheat = resolveBindingCheat(binding);
        if (!cheat) {
            return fail(
                binding.cheatName
                    ? `"${binding.cheatName}" is not in this trainer`
                    : 'No mod selected',
            );
        }

        switch (binding.action) {
            case EOscAction.Set: {
                const value = valueFromArgs(cheat, args, binding.rescale ? binding : null);
                return value === null
                    ? fail(`Cannot drive ${cheat.name} with this argument`)
                    : write(cheat, value, { throttle: isNumericCheat(cheat) });
            }
            case EOscAction.Hold:
                if (isPressCheat(cheat)) return isTriggered(args) ? write(cheat, 1) : null;
                if (cheat.type !== ECheatType.Toggle) return fail(`${cheat.name} is not a toggle`);
                return write(cheat, isTriggered(args));
            case EOscAction.Toggle:
                if (!isTriggered(args)) return null;
                if (isPressCheat(cheat)) return write(cheat, 1);
                if (cheat.type !== ECheatType.Toggle) return fail(`${cheat.name} is not a toggle`);
                return write(cheat, !currentValue(cheat.target));
            case EOscAction.Press:
                return isTriggered(args) ? write(cheat, 1) : null;
            case EOscAction.Fixed: {
                if (!isTriggered(args)) return null;
                const value = fixedValue(cheat, binding.value);
                return value === null
                    ? fail(`Invalid value for ${cheat.name}`)
                    : write(cheat, value);
            }
            case EOscAction.Step: {
                if (!isTriggered(args)) return null;
                const value = stepValue(cheat, currentValue(cheat.target), Number(binding.value));
                return value === null ? fail(`${cheat.name} cannot step`) : write(cheat, value);
            }
            default:
                return null;
        }
    }

    /** Zero-config routes under the prefix, e.g. `/wand/cheat/god 1` or `/wand/panic`. */
    function routeNamespace(message: OscMessage, peer: UdpPeer): Outcome {
        const prefix = `${config.prefix}/`;
        if (!message.address.startsWith(prefix)) {
            return null;
        }

        const [route, key, op] = message.address.slice(prefix.length).split('/');
        const args = message.args;
        switch (route) {
            case 'cheat':
                return routeCheat(key, op ?? '', args);
            case 'panic':
                return isTriggered(args) ? panic() : null;
            case 'stop':
                return isTriggered(args) ? command('stop', currentGameId()) : null;
            case 'launch': {
                const wanted = args[0] && typeof args[0].value === 'string' ? args[0].value : '';
                const gameId = resolveGameId(wanted);
                return gameId
                    ? command('launch', gameId)
                    : fail(`No installed game matches "${wanted}"`);
            }
            case 'chatbox':
                if (key === 'clear') {
                    if (!isTriggered(args)) return null;
                    holdUntil = Date.now() + config.chatbox.intervalSeconds * 1000;
                    queueChatbox('', false);
                    return { note: 'Chatbox cleared' };
                }
                if (!args[0] || typeof args[0].value !== 'string') {
                    return fail('Send the chatbox text as a string argument');
                }
                return announce(renderChatboxTemplate(args[0].value, chatboxContext()))
                    ? { note: 'Chatbox message sent' }
                    : fail('Chatbox is not reachable');
            case 'query':
                replyWithState(peer);
                return { note: 'State sent to sender' };
            default:
                return fail(`Unknown route ${config.prefix}/${route ?? ''}`);
        }
    }

    function routeCheat(key: string | undefined, op: string, args: OscArg[]): Outcome {
        const cheat = key ? findCheatByKey(key) : null;
        if (!cheat) {
            return fail(`Unknown mod "${key ?? ''}"`);
        }

        switch (op) {
            case '': {
                if (args.length === 0) {
                    if (cheat.type === ECheatType.Toggle)
                        return write(cheat, !currentValue(cheat.target));
                    return isPressCheat(cheat)
                        ? write(cheat, 1)
                        : fail(`${cheat.name} needs a value`);
                }
                const value = valueFromArgs(cheat, args, null);
                return value === null
                    ? fail(`Cannot drive ${cheat.name} with this argument`)
                    : write(cheat, value, { throttle: isNumericCheat(cheat) });
            }
            case 'toggle':
                if (!isTriggered(args)) return null;
                if (isPressCheat(cheat)) return write(cheat, 1);
                return cheat.type === ECheatType.Toggle
                    ? write(cheat, !currentValue(cheat.target))
                    : fail(`${cheat.name} is not a toggle`);
            case 'inc':
            case 'dec': {
                if (!isTriggered(args)) return null;
                const amount = defaultStep(cheat) * (op === 'inc' ? 1 : -1);
                const value = stepValue(cheat, currentValue(cheat.target), amount);
                return value === null ? fail(`${cheat.name} cannot step`) : write(cheat, value);
            }
            case 'add': {
                const amount = argNumber(args[0]);
                const value =
                    amount === null ? null : stepValue(cheat, currentValue(cheat.target), amount);
                return value === null ? fail(`${cheat.name} cannot add that`) : write(cheat, value);
            }
            default:
                return fail(`Unknown mod operation "${op}"`);
        }
    }

    // ---- trainer writes --------------------------------------------------------------------

    function write(
        cheat: CheatSchema,
        value: CheatWriteValue,
        { throttle = false }: { throttle?: boolean } = {},
    ): Outcome {
        const press = isPressCheat(cheat);
        if (!press && sameValue(currentValue(cheat.target), value)) {
            // Also breaks feedback loops with controllers that echo what they receive.
            return { note: `${cheat.name} already ${formatChatboxValue(cheat, value)}` };
        }

        if (!press) {
            optimisticValues.set(cheat.target, { value, at: Date.now() });
        }
        const note = press
            ? `${cheat.name} fired`
            : `${cheat.name} → ${formatChatboxValue(cheat, value)}`;

        if (!throttle || config.throttleMs <= 0) {
            dispatchWrite(cheat, value);
            return { note };
        }

        const now = Date.now();
        const slot = throttledWrites.get(cheat.target) ?? { lastAt: 0, pending: null, timer: null };
        throttledWrites.set(cheat.target, slot);
        if (now - slot.lastAt >= config.throttleMs && !slot.timer) {
            slot.lastAt = now;
            dispatchWrite(cheat, value);
            return { note };
        }

        slot.pending = value;
        slot.timer ??= unref(
            setTimeout(
                () => {
                    slot.timer = null;
                    slot.lastAt = Date.now();
                    if (slot.pending !== null) {
                        const pending = slot.pending;
                        slot.pending = null;
                        dispatchWrite(cheat, pending);
                    }
                },
                Math.max(0, config.throttleMs - (now - slot.lastAt)),
            ),
        );
        return { note };
    }

    function dispatchWrite(cheat: CheatSchema, value: CheatWriteValue) {
        host.setValue(cheat.target, value)
            .then((accepted) => {
                if (!accepted) {
                    optimisticValues.delete(cheat.target);
                    record({
                        direction: EOscDirection.Error,
                        address: '',
                        note: `Wand rejected ${cheat.name}`,
                        failed: true,
                    });
                }
            })
            .catch((error: unknown) => {
                optimisticValues.delete(cheat.target);
                recordFailure(`Failed to write ${cheat.name}.`, error);
            });
    }

    function panic(): Outcome {
        const cheats = host.getTrainerMeta()?.schema.cheats ?? [];
        let count = 0;
        for (const cheat of cheats) {
            if (cheat.type === ECheatType.Toggle && currentValue(cheat.target)) {
                write(cheat, false);
                count += 1;
            }
        }
        return { note: count > 0 ? `Panic: ${count} mods off` : 'Panic: nothing was on' };
    }

    function command(action: RemoteCommandAction, gameId: string | null): Outcome {
        host.runCommand(action, gameId)
            .then((ok) => {
                if (!ok) {
                    record({
                        direction: EOscDirection.Error,
                        address: '',
                        note:
                            action === 'launch'
                                ? 'Wand could not launch the game'
                                : 'Wand could not stop the game',
                        failed: true,
                    });
                }
            })
            .catch((error: unknown) => recordFailure(`Remote ${action} failed.`, error));
        return { note: action === 'launch' ? 'Launching game' : 'Stopping game' };
    }

    // ---- bridge events / feedback ----------------------------------------------------------

    function handleEvent(event: OscBotEvent) {
        if (event.type === 'trainer') {
            optimisticValues.clear();
            lastChange = null;
            for (const write of throttledWrites.values()) clearTimer(write.timer, clearTimeout);
            throttledWrites.clear();
            if (running) mirrorEverything();
            return;
        }

        if (event.type === 'game_status') {
            if (running) mirrorGame();
            return;
        }

        optimisticValues.delete(event.target);
        lastChange = { target: event.target, value: event.value };
        if (!running) {
            return;
        }

        const cheat = host
            .getTrainerMeta()
            ?.schema.cheats.find((entry) => entry.target === event.target);
        if (!cheat) {
            return;
        }
        mirrorValue(cheat, event.value);
        sendBindingFeedback(cheat, event.value);
        if (
            config.chatbox.enabled &&
            config.chatbox.announceChanges &&
            config.chatbox.announceTemplate.trim()
        ) {
            announce(renderChatboxTemplate(config.chatbox.announceTemplate, chatboxContext()));
        }
    }

    function mirrorEverything() {
        if (!running || (!hasTargets('state') && !hasTargets('bindings'))) {
            return;
        }
        mirrorGame();
        const meta = host.getTrainerMeta();
        const values = host.getValues();
        for (const cheat of meta?.schema.cheats ?? []) {
            mirrorValue(cheat, values[cheat.target], false);
            sendBindingFeedback(cheat, values[cheat.target]);
        }
        mirrorModCount();
    }

    function mirrorGame(peer?: UdpPeer) {
        const context = chatboxContext();
        sendState(
            `${config.prefix}/game/running`,
            [{ type: 'i', value: context.active ? 1 : 0 }],
            peer,
        );
        sendState(`${config.prefix}/game/title`, [{ type: 's', value: context.game ?? '' }], peer);
        sendState(
            `${config.prefix}/trainer/active`,
            [{ type: 'i', value: host.getTrainerMeta() ? 1 : 0 }],
            peer,
        );
    }

    function mirrorValue(cheat: CheatSchema, value: unknown, withCount = true, peer?: UdpPeer) {
        const args = stateArgs(cheat, value);
        if (args) sendState(`${config.prefix}/cheat/${cheat.target}`, args, peer);
        if (withCount) mirrorModCount(peer);
    }

    function mirrorModCount(peer?: UdpPeer) {
        const context = chatboxContext();
        sendState(`${config.prefix}/mods/on`, [{ type: 'i', value: context.modsOn }], peer);
        sendState(`${config.prefix}/mods/total`, [{ type: 'i', value: context.modsTotal }], peer);
    }

    function replyWithState(peer: UdpPeer) {
        mirrorGame(peer);
        const values = mergedValues();
        for (const cheat of host.getTrainerMeta()?.schema.cheats ?? []) {
            mirrorValue(cheat, values[cheat.target], false, peer);
        }
        mirrorModCount(peer);
    }

    function sendState(address: string, args: OscArg[], peer?: UdpPeer) {
        if (peer) {
            // Replies go out of the listen socket so clients that read their own port get them.
            send(listenSocket, peer.address, peer.port, address, args);
            return;
        }
        sendToTargets('state', address, args);
    }

    function sendBindingFeedback(cheat: CheatSchema, value: unknown) {
        if (!hasTargets('bindings')) {
            return;
        }
        for (const binding of config.bindings) {
            if (!binding.enabled || !binding.feedback || !isLiteralOscAddress(binding.address))
                continue;
            if (!inScope(binding) || resolveBindingCheat(binding)?.target !== cheat.target)
                continue;
            const args = feedbackArgs(
                cheat,
                value,
                learnedArgTypes.get(binding.address),
                binding.rescale ? binding : null,
            );
            if (args) sendToTargets('bindings', binding.address, args);
        }
    }

    // ---- chatbox ---------------------------------------------------------------------------

    function scheduleChatbox() {
        clearTimer(chatboxTimer, clearInterval);
        chatboxTimer = null;
        if (!running || !config.chatbox.enabled) {
            return;
        }
        chatboxTimer = unref(setInterval(chatboxTick, config.chatbox.intervalSeconds * 1000));
        chatboxTick();
    }

    function chatboxTick() {
        if (!running || !config.chatbox.enabled || Date.now() < holdUntil) {
            return;
        }

        const context = chatboxContext();
        if (!context.active) {
            const idle = config.chatbox.idleMessage.trim()
                ? renderChatboxTemplate(config.chatbox.idleMessage, context)
                : '';
            if (idle || lastSentText) {
                queueChatbox(idle, false);
            }
            return;
        }

        const messages = config.chatbox.messages;
        for (let offset = 0; offset < messages.length; offset += 1) {
            const index = (rotationIndex + offset) % messages.length;
            const text = renderChatboxTemplate(messages[index], context);
            if (text.trim()) {
                rotationIndex = index + 1;
                queueChatbox(text, false);
                return;
            }
        }
    }

    /** Pushes a one-off message and keeps it up for a full rotation interval. */
    function announce(text: string): boolean {
        if (!running || !text.trim() || !hasTargets('chatbox')) {
            return false;
        }
        holdUntil = Date.now() + config.chatbox.intervalSeconds * 1000;
        queueChatbox(text, config.chatbox.notifySound);
        return true;
    }

    function queueChatbox(text: string, notify: boolean) {
        // Newest wins: VRChat silently drops messages that arrive too quickly.
        pendingChatbox = { text, notify };
        const wait = lastSentAt + OSC_LIMITS.chatboxMinSpacingMs - Date.now();
        if (wait <= 0) {
            deliverChatbox();
        } else {
            deliveryTimer ??= unref(
                setTimeout(() => {
                    deliveryTimer = null;
                    deliverChatbox();
                }, wait),
            );
        }
    }

    function deliverChatbox() {
        const next = pendingChatbox;
        pendingChatbox = null;
        if (!next || !running) {
            return;
        }
        lastSentAt = Date.now();
        if (config.chatbox.typingIndicator && next.text) {
            sendToTargets('chatbox', '/chatbox/typing', [{ type: 'T', value: true }]);
            clearTimer(typingTimer, clearTimeout);
            typingTimer = unref(
                setTimeout(() => {
                    typingTimer = null;
                    sendChatboxInput(next.text, next.notify);
                }, TYPING_LEAD_MS),
            );
            return;
        }
        sendChatboxInput(next.text, next.notify);
    }

    function sendChatboxInput(text: string, notify: boolean) {
        sendToTargets('chatbox', '/chatbox/input', [
            { type: 's', value: text },
            { type: 'T', value: true },
            notify ? { type: 'T', value: true } : { type: 'F', value: false },
        ]);
        lastSentText = text;
        lastChatboxAt = Date.now();
        publishStatus();
    }

    function chatboxContext(): ChatboxContext {
        return buildChatboxContext({
            trainerMeta: host.getTrainerMeta(),
            values: mergedValues(),
            gameStatus: host.getGameStatus(),
            lastChange,
            uptimeSeconds: startedAt ? (Date.now() - startedAt) / 1000 : 0,
            now: new Date(),
        });
    }

    // ---- transport -------------------------------------------------------------------------

    function hasTargets(kind: 'chatbox' | 'state' | 'bindings') {
        return config.targets.some((target) => target.enabled && target[kind]);
    }

    function sendToTargets(
        kind: 'chatbox' | 'state' | 'bindings' | null,
        address: string,
        args: OscArg[],
    ) {
        for (const target of config.targets) {
            if (target.enabled && (kind === null || target[kind])) {
                send(sendSocket, target.host, target.port, address, args);
            }
        }
    }

    function send(
        socket: UdpSocketPort | null,
        hostName: string,
        port: number,
        address: string,
        args: OscArg[],
    ) {
        if (!socket || !running) {
            return;
        }
        let packet: Buffer;
        try {
            packet = encodeMessage(address, args);
        } catch (error) {
            recordFailure(`Could not encode ${address}.`, error);
            return;
        }
        try {
            socket.send(packet, port, hostName, (error) => {
                if (error) recordFailure(`Send to ${hostName}:${port} failed.`, error);
            });
        } catch (error) {
            recordFailure(`Send to ${hostName}:${port} failed.`, error);
            return;
        }
        packetsOut += 1;
        bucket.out += 1;
        record({ direction: EOscDirection.Out, address, args, peer: `${hostName}:${port}` });
    }

    // ---- activity & status -----------------------------------------------------------------

    function record(entry: {
        direction: EOscDirection;
        address: string;
        args?: OscArg[];
        peer?: string;
        bindingId?: string | null;
        note?: string | null;
        failed?: boolean;
    }) {
        const now = Date.now();
        const args = previewArgs(entry.args ?? []);
        const peer = entry.peer ?? '';
        for (
            let index = activity.length - 1;
            index >= Math.max(0, activity.length - ACTIVITY_FOLD_LOOKBACK);
            index -= 1
        ) {
            const existing = activity[index];
            if (
                existing.direction === entry.direction &&
                existing.address === entry.address &&
                existing.peer === peer &&
                existing.note === (entry.note ?? null) &&
                now - existing.at < ACTIVITY_FOLD_WINDOW_MS
            ) {
                existing.args = args;
                existing.at = now;
                existing.count += 1;
                existing.failed = entry.failed || undefined;
                queueActivity(existing);
                return;
            }
        }

        const created: OscActivityEntry = {
            id: nextActivityId++,
            at: now,
            direction: entry.direction,
            address: entry.address,
            args,
            peer,
            count: 1,
            bindingId: entry.bindingId ?? null,
            note: entry.note ?? null,
            failed: entry.failed || undefined,
        };
        activity.push(created);
        if (activity.length > ACTIVITY_LIMIT) {
            activity.splice(0, activity.length - ACTIVITY_LIMIT);
        }
        queueActivity(created);
    }

    function queueActivity(entry: OscActivityEntry) {
        pendingActivity.set(entry.id, entry);
        flushTimer ??= unref(
            setTimeout(() => {
                flushTimer = null;
                const entries = Array.from(pendingActivity.values()).map((item) => ({ ...item }));
                pendingActivity.clear();
                if (entries.length > 0) publish('osc_activity', { entries });
            }, ACTIVITY_FLUSH_MS),
        );
    }

    function recordFailure(message: string, error: unknown) {
        errors += 1;
        log('warn', `OSC bot: ${message}`, error);
        record({
            direction: EOscDirection.Error,
            address: '',
            note: `${message} ${error instanceof Error ? error.message : ''}`.trim(),
            failed: true,
        });
    }

    function tickStats() {
        history.push(bucket);
        if (history.length > OSC_LIMITS.historySeconds) {
            history = history.slice(-OSC_LIMITS.historySeconds);
        }
        bucket = { in: 0, out: 0 };
        publishStatus();
    }

    function buildStatus(): OscBotStatus {
        return {
            state,
            listenAddress,
            error: lastError,
            startedAt: startedAt ? new Date(startedAt).toISOString() : null,
            packetsIn,
            packetsOut,
            errors,
            history: history.slice(),
            lastChatbox: lastSentText,
            lastChatboxAt: lastChatboxAt ? new Date(lastChatboxAt).toISOString() : null,
        };
    }

    function publishStatus(force = false) {
        const status = buildStatus();
        const busy = status.history.some((sample) => sample.in > 0 || sample.out > 0);
        const signature = JSON.stringify({ ...status, history: busy ? status.history : null });
        if (!force && signature === lastStatusSignature) {
            return;
        }
        lastStatusSignature = signature;
        publish('osc_status', { status });
    }

    // ---- lookups ---------------------------------------------------------------------------

    function currentValue(target: string): unknown {
        const optimistic = optimisticValues.get(target);
        if (optimistic && Date.now() - optimistic.at < OPTIMISTIC_VALUE_TTL_MS) {
            return optimistic.value;
        }
        return host.getValues()[target];
    }

    function mergedValues(): Record<string, unknown> {
        const values = { ...host.getValues() };
        for (const target of optimisticValues.keys()) {
            values[target] = currentValue(target);
        }
        return values;
    }

    function currentGameId(): string | null {
        const status = host.getGameStatus();
        return (
            host.getTrainerMeta()?.trainer.gameId ||
            status?.session.gameId ||
            status?.trainer.gameId ||
            null
        );
    }

    function inScope(binding: OscBinding): boolean {
        return !binding.scope || binding.scope === currentGameId();
    }

    function resolveBindingCheat(binding: OscBinding): CheatSchema | null {
        const cheats = host.getTrainerMeta()?.schema.cheats ?? [];
        const byTarget = binding.target
            ? cheats.find((cheat) => cheat.target === binding.target)
            : undefined;
        if (byTarget) {
            return byTarget;
        }
        const name = binding.cheatName?.toLowerCase();
        return (name && cheats.find((cheat) => cheat.name.toLowerCase() === name)) || null;
    }

    function findCheatByKey(key: string): CheatSchema | null {
        const cheats = host.getTrainerMeta()?.schema.cheats ?? [];
        const decoded = safeDecode(key);
        const lower = decoded.toLowerCase();
        return (
            cheats.find((cheat) => cheat.target === decoded) ??
            cheats.find((cheat) => cheat.target.toLowerCase() === lower) ??
            cheats.find((cheat) => slugifyCheatName(cheat.name) === lower) ??
            null
        );
    }

    function resolveGameId(wanted: string): string | null {
        const needle = wanted.trim().toLowerCase();
        if (!needle) return null;
        const apps = host.getInstalledApps().filter((app) => app.gameId);
        const match =
            apps.find((app) => app.gameId?.toLowerCase() === needle) ??
            apps.find((app) => app.displayName.toLowerCase() === needle) ??
            apps.find((app) => app.displayName.toLowerCase().includes(needle));
        return match?.gameId ?? null;
    }

    function learnArgType(address: string, type: string) {
        learnedArgTypes.delete(address);
        learnedArgTypes.set(address, type);
        if (learnedArgTypes.size > MAX_LEARNED_ADDRESSES) {
            const oldest = learnedArgTypes.keys().next().value;
            if (oldest !== undefined) learnedArgTypes.delete(oldest);
        }
    }

    function fail(note: string): Outcome {
        return { note, failed: true };
    }

    // ---- public API ------------------------------------------------------------------------

    function getState(): OscStatePayload {
        return {
            config,
            status: buildStatus(),
            activity: activity.slice(-ACTIVITY_SNAPSHOT).map((entry) => ({ ...entry })),
        };
    }

    function updateConfig(raw: unknown, requestId: string | null = null) {
        const next = normalizeOscConfig(raw);
        const saved = store.save(next);
        applyConfig(next);
        publish('osc_state', getState(), requestId);
        return saved;
    }

    function runCommand(payload: OscCommandPayload): OscCommandResultPayload {
        const reject = (code: string, message: string): OscCommandResultPayload => ({
            ok: false,
            action: payload.action,
            error: { code, message },
        });

        if (payload.action === 'reset_stats') {
            packetsIn = packetsOut = errors = 0;
            history = [];
            bucket = { in: 0, out: 0 };
            activity.length = 0;
            publish('osc_state', getState());
            return { ok: true, action: payload.action };
        }
        if (!running) {
            return reject('osc_disabled', 'Turn the OSC bot on first.');
        }

        if (payload.action === 'send') {
            if (!isValidOscAddress(payload.address)) {
                return reject(
                    'invalid_address',
                    'OSC addresses start with "/" and contain no spaces.',
                );
            }
            const target = payload.targetId
                ? config.targets.find((entry) => entry.id === payload.targetId)
                : null;
            if (payload.targetId && !target) {
                return reject('invalid_target', 'That output no longer exists.');
            }
            const args = argsFromPreviews(Array.isArray(payload.args) ? payload.args : []);
            if (target) {
                send(sendSocket, target.host, target.port, payload.address, args);
            } else {
                sendToTargets(null, payload.address, args);
            }
            return { ok: true, action: payload.action };
        }

        if (payload.action === 'chatbox_send') {
            const text = renderChatboxTemplate(String(payload.text ?? ''), chatboxContext());
            return announce(text)
                ? { ok: true, action: payload.action }
                : reject('chatbox_unreachable', 'Add an output with Chatbox enabled first.');
        }

        holdUntil = Date.now() + config.chatbox.intervalSeconds * 1000;
        queueChatbox('', false);
        return { ok: true, action: payload.action };
    }

    function close() {
        closed = true;
        stopTransport();
        clearTimer(flushTimer, clearTimeout);
        flushTimer = null;
        pendingActivity.clear();
    }

    start();

    return {
        getState,
        updateConfig,
        runCommand,
        handleEvent,
        close,
        get running() {
            return running;
        },
    };
}

export type OscBot = ReturnType<typeof createOscBot>;

function defaultSocket(): UdpSocketPort {
    return dgram.createSocket({ type: 'udp4' }) as unknown as UdpSocketPort;
}

function describeBindError(error: Error & { code?: string }, port: number): string {
    if (error.code === 'EADDRINUSE') {
        return `Port ${port} is already used by another OSC app. Sending still works.`;
    }
    if (error.code === 'EACCES') {
        return `Windows refused port ${port}. Pick another listen port.`;
    }
    return error.message || `Could not listen on port ${port}.`;
}

function safeClose(socket: UdpSocketPort | null) {
    try {
        socket?.close();
    } catch {}
}

function clearTimer<T>(timer: T | null, clear: (timer: T) => void) {
    if (timer !== null) clear(timer);
}

function unref<T>(timer: T): T {
    (timer as { unref?: () => void })?.unref?.();
    return timer;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
