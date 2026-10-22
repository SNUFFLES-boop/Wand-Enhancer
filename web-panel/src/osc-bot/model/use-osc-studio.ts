import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildChatboxContext, type ChatboxContext } from '../../../protocol/chatbox-template';
import type {
    CheatSchema,
    GameStatusPayload,
    OscCommandPayload,
    TrainerMetaPayload,
} from '../../../protocol/messages';
import {
    createOscId,
    createVrchatTarget,
    EOscDirection,
    isValidOscAddress,
    isValidOscHost,
    normalizeOscConfig,
    OSC_LIMITS,
    OSC_VRCHAT_DEFAULTS,
    type OscActivityEntry,
    type OscBinding,
    type OscBotConfig,
    type OscChatboxConfig,
    type OscTarget,
} from '../../../protocol/osc';
import type { OscSessionState } from '../../remote-session/remote-session.reducer';
import { bindingFromActivity, generateAvatarBindings, newBinding } from './bindings';
import { parseOscArgs } from './osc-args';
import { isVrchatNoise } from './vrchat-noise';

export type LaunchableGame = { gameId: string; title: string };

/** What the studio needs from the remote session; composed by the app shell. */
export type OscStudioSession = {
    connected: boolean;
    osc: OscSessionState | null;
    trainerMeta: TrainerMetaPayload | null;
    values: Record<string, unknown>;
    gameStatus: GameStatusPayload | null;
    lastChange: { target: string; value: unknown } | null;
    launchableGames: LaunchableGame[];
    editOscConfig: (config: OscBotConfig, immediate?: boolean) => void;
    sendOscCommand: (payload: OscCommandPayload) => boolean;
};

export enum EOscPreset {
    Vrchat = 'vrchat',
    Lan = 'lan',
}

export type LearningState = { bindingId: string; sinceId: number };

const LEARN_TIMEOUT_MS = 20000;
const LAN_CONTROLLER_PORT = 8000;

export function useOscStudio(session: OscStudioSession) {
    const { osc, editOscConfig, sendOscCommand } = session;
    const configRef = useRef<OscBotConfig | null>(osc?.config ?? null);
    configRef.current = osc?.config ?? null;
    const [learning, setLearning] = useState<LearningState | null>(null);
    const learnTimerRef = useRef<number | null>(null);

    const cheats: CheatSchema[] = session.trainerMeta?.schema.cheats ?? [];
    const currentGameId =
        session.trainerMeta?.trainer.gameId ??
        session.gameStatus?.session.gameId ??
        session.gameStatus?.trainer.gameId ??
        null;

    // Chained edits in one event must build on each other, not on the last render.
    const update = useCallback(
        (change: (config: OscBotConfig) => OscBotConfig, immediate = false) => {
            const current = configRef.current;
            if (!current) return;
            const next = change(current);
            configRef.current = next;
            editOscConfig(next, immediate);
        },
        [editOscConfig],
    );

    const updateBinding = useCallback(
        (id: string, patch: Partial<OscBinding>, immediate = false) =>
            update(
                (config) => ({
                    ...config,
                    bindings: config.bindings.map((binding) =>
                        binding.id === id ? { ...binding, ...patch } : binding,
                    ),
                }),
                immediate,
            ),
        [update],
    );

    const stopLearning = useCallback(() => {
        if (learnTimerRef.current !== null) {
            window.clearTimeout(learnTimerRef.current);
            learnTimerRef.current = null;
        }
        setLearning(null);
    }, []);

    const activity = osc?.activity ?? [];
    const lastActivityId = activity[activity.length - 1]?.id ?? 0;

    // Learning listens to the bridge's activity stream: the first fresh, non-noise input wins.
    useEffect(() => {
        if (!learning) return;
        const heard = activity.find(
            (entry) =>
                entry.id > learning.sinceId &&
                entry.direction === EOscDirection.In &&
                entry.address &&
                !isVrchatNoise(entry.address),
        );
        if (heard) {
            updateBinding(learning.bindingId, { address: heard.address }, true);
            stopLearning();
        }
    }, [activity, learning, stopLearning, updateBinding]);

    useEffect(() => stopLearning, [stopLearning]);

    const startLearning = useCallback(
        (bindingId: string) => {
            stopLearning();
            setLearning({ bindingId, sinceId: lastActivityId });
            learnTimerRef.current = window.setTimeout(stopLearning, LEARN_TIMEOUT_MS);
        },
        [lastActivityId, stopLearning],
    );

    const contextAt = useCallback(
        (now: Date): ChatboxContext => {
            const startedAt = osc?.status.startedAt ? Date.parse(osc.status.startedAt) : Number.NaN;
            return buildChatboxContext({
                trainerMeta: session.trainerMeta,
                values: session.values,
                gameStatus: session.gameStatus,
                lastChange: session.lastChange,
                uptimeSeconds: Number.isFinite(startedAt) ? (now.getTime() - startedAt) / 1000 : 0,
                now,
            });
        },
        [
            osc?.status.startedAt,
            session.gameStatus,
            session.lastChange,
            session.trainerMeta,
            session.values,
        ],
    );

    const bot = useMemo(
        () => ({
            setEnabled: (enabled: boolean) => update((config) => ({ ...config, enabled }), true),
            applyPreset: (preset: EOscPreset) =>
                update((config) => {
                    if (preset === EOscPreset.Lan) {
                        return {
                            ...config,
                            enabled: true,
                            allowLan: true,
                            listenPort: LAN_CONTROLLER_PORT,
                        };
                    }
                    const hasVrchat = config.targets.some(
                        (target) =>
                            target.host === OSC_VRCHAT_DEFAULTS.host &&
                            target.port === OSC_VRCHAT_DEFAULTS.inputPort,
                    );
                    return {
                        ...config,
                        enabled: true,
                        allowLan: false,
                        listenPort: OSC_VRCHAT_DEFAULTS.outputPort,
                        targets: hasVrchat
                            ? config.targets
                            : [createVrchatTarget(createOscId('t')), ...config.targets].slice(
                                  0,
                                  OSC_LIMITS.maxTargets,
                              ),
                        chatbox: { ...config.chatbox, enabled: true },
                    };
                }, true),
        }),
        [update],
    );

    const network = useMemo(() => {
        const updateTarget = (id: string, patch: Partial<OscTarget>) =>
            update(
                (config) => ({
                    ...config,
                    targets: config.targets.map((target) =>
                        target.id === id ? { ...target, ...patch } : target,
                    ),
                }),
                true,
            );

        return {
            setListenPort: (raw: string) => {
                const port = Number(raw);
                if (!Number.isInteger(port) || port <= 0 || port > 65535) return false;
                update((config) => ({ ...config, listenPort: port }), true);
                return true;
            },
            setAllowLan: (allowLan: boolean) => update((config) => ({ ...config, allowLan }), true),
            setPrefix: (raw: string) => {
                const prefix = raw.trim().replace(/\/+$/, '');
                if (!isValidOscAddress(prefix) || prefix.length < 2 || prefix.length > 64)
                    return false;
                update((config) => ({ ...config, prefix }), true);
                return true;
            },
            setAutoMap: (autoMap: boolean) => update((config) => ({ ...config, autoMap }), true),
            setThrottle: (throttleMs: number) => update((config) => ({ ...config, throttleMs })),
            addTarget: (vrchat: boolean) =>
                update(
                    (config) => ({
                        ...config,
                        targets: [
                            ...config.targets,
                            vrchat
                                ? createVrchatTarget(createOscId('t'))
                                : {
                                      id: createOscId('t'),
                                      name: 'Controller',
                                      host: '127.0.0.1',
                                      port: 9000,
                                      enabled: true,
                                      chatbox: false,
                                      state: true,
                                      bindings: true,
                                  },
                        ].slice(0, OSC_LIMITS.maxTargets),
                    }),
                    true,
                ),
            updateTarget,
            setTargetHost: (id: string, raw: string) => {
                const host = raw.trim();
                if (!isValidOscHost(host)) return false;
                updateTarget(id, { host });
                return true;
            },
            setTargetPort: (id: string, raw: string) => {
                const port = Number(raw);
                if (!Number.isInteger(port) || port <= 0 || port > 65535) return false;
                updateTarget(id, { port });
                return true;
            },
            removeTarget: (id: string) =>
                update(
                    (config) => ({
                        ...config,
                        targets: config.targets.filter((target) => target.id !== id),
                    }),
                    true,
                ),
        };
    }, [update]);

    const chatbox = useMemo(() => {
        const patchChatbox = (patch: Partial<OscChatboxConfig>, immediate = false) =>
            update(
                (config) => ({ ...config, chatbox: { ...config.chatbox, ...patch } }),
                immediate,
            );
        const mapMessages = (change: (messages: string[]) => string[], immediate = false) =>
            update(
                (config) => ({
                    ...config,
                    chatbox: { ...config.chatbox, messages: change(config.chatbox.messages) },
                }),
                immediate,
            );

        return {
            update: patchChatbox,
            setMessage: (index: number, text: string) =>
                mapMessages((messages) =>
                    messages.map((message, position) => (position === index ? text : message)),
                ),
            addMessage: (text = '') =>
                mapMessages(
                    (messages) => [...messages, text].slice(0, OSC_LIMITS.maxMessages),
                    true,
                ),
            removeMessage: (index: number) =>
                mapMessages(
                    (messages) => messages.filter((_, position) => position !== index),
                    true,
                ),
            moveMessage: (index: number, direction: -1 | 1) =>
                mapMessages((messages) => {
                    const next = [...messages];
                    const swap = index + direction;
                    if (swap < 0 || swap >= next.length) return messages;
                    [next[index], next[swap]] = [next[swap], next[index]];
                    return next;
                }, true),
            sendNow: (text: string) => sendOscCommand({ action: 'chatbox_send', text }),
            clear: () => sendOscCommand({ action: 'chatbox_clear' }),
            contextAt,
        };
    }, [contextAt, sendOscCommand, update]);

    const bindings = useMemo(
        () => ({
            add: () => {
                const binding = newBinding(cheats, currentGameId);
                update(
                    (config) => ({
                        ...config,
                        bindings: [...config.bindings, binding].slice(0, OSC_LIMITS.maxBindings),
                    }),
                    true,
                );
                return binding.id;
            },
            update: updateBinding,
            remove: (id: string) =>
                update(
                    (config) => ({
                        ...config,
                        bindings: config.bindings.filter((binding) => binding.id !== id),
                    }),
                    true,
                ),
            duplicate: (id: string) => {
                const source = configRef.current?.bindings.find((binding) => binding.id === id);
                if (!source) return null;
                const copy = { ...source, id: createOscId('b') };
                update((config) => {
                    const index = config.bindings.findIndex((binding) => binding.id === id);
                    const next = [...config.bindings];
                    next.splice(index + 1, 0, copy);
                    return { ...config, bindings: next.slice(0, OSC_LIMITS.maxBindings) };
                }, true);
                return copy.id;
            },
            generate: () => {
                const created = generateAvatarBindings(cheats, configRef.current?.bindings ?? []);
                if (created.length > 0) {
                    update(
                        (config) => ({ ...config, bindings: [...config.bindings, ...created] }),
                        true,
                    );
                }
                return created.length;
            },
            bindFrom: (entry: OscActivityEntry) => {
                const binding = bindingFromActivity(entry, cheats, currentGameId);
                update(
                    (config) => ({
                        ...config,
                        bindings: [...config.bindings, binding].slice(0, OSC_LIMITS.maxBindings),
                    }),
                    true,
                );
                return binding.id;
            },
            learning,
            startLearning,
            stopLearning,
        }),
        [cheats, currentGameId, learning, startLearning, stopLearning, update, updateBinding],
    );

    const monitor = useMemo(
        () => ({
            send: (address: string, argsText: string, targetId: string | null) => {
                if (!isValidOscAddress(address.trim())) return false;
                return sendOscCommand({
                    action: 'send',
                    address: address.trim(),
                    args: parseOscArgs(argsText),
                    targetId,
                });
            },
            resetStats: () => sendOscCommand({ action: 'reset_stats' }),
        }),
        [sendOscCommand],
    );

    const backup = useMemo(
        () => ({
            exportJson: () => JSON.stringify(configRef.current, null, 2),
            importJson: (text: string) => {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(text);
                } catch {
                    return false;
                }
                if (typeof parsed !== 'object' || parsed === null) return false;
                // Importing a profile never flips the network listener on or off by itself.
                update(
                    (config) => ({ ...normalizeOscConfig(parsed), enabled: config.enabled }),
                    true,
                );
                return true;
            },
        }),
        [update],
    );

    return {
        ready: Boolean(osc),
        connected: session.connected,
        config: osc?.config ?? null,
        status: osc?.status ?? null,
        activity,
        notice: osc?.notice ?? null,
        cheats,
        currentGameId,
        launchableGames: session.launchableGames,
        bot,
        network,
        chatbox,
        bindings,
        monitor,
        backup,
    };
}

export type OscStudioModel = ReturnType<typeof useOscStudio>;
