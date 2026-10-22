// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECheatType, type TrainerMetaPayload } from '../../../protocol/messages';
import {
    createDefaultOscConfig,
    createOscBinding,
    EOscAction,
    EOscBotState,
    type OscBotConfig,
} from '../../../protocol/osc';
import { createOscBot, type OscBotHost, type UdpPeer, type UdpSocketPort } from './osc-bot';
import { decodePacket, encodeMessage, type OscArg } from './osc-codec';

type Listener = (...args: any[]) => void;

class FakeSocket implements UdpSocketPort {
    listeners = new Map<string, Listener[]>();
    sent: { address: string; args: unknown[]; host: string; port: number }[] = [];
    bound: { port: number; address: string } | null = null;
    closed = false;

    constructor(private readonly failBind: boolean) {}

    on(event: string, listener: Listener) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }

    emit(event: string, ...args: unknown[]) {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    bind(port: number, address: string) {
        this.bound = { port, address };
        queueMicrotask(() => {
            if (this.failBind) {
                this.emit('error', Object.assign(new Error('in use'), { code: 'EADDRINUSE' }));
            } else {
                this.emit('listening');
            }
        });
    }

    send(message: Buffer, port: number, host: string, callback: (error: Error | null) => void) {
        const [decoded] = decodePacket(message);
        this.sent.push({
            address: decoded.address,
            args: decoded.args.map((arg) => arg.value),
            host,
            port,
        });
        callback(null);
    }

    close() {
        this.closed = true;
    }

    receive(address: string, args: OscArg[], peer: UdpPeer = { address: '127.0.0.1', port: 5555 }) {
        this.emit('message', encodeMessage(address, args), peer);
    }
}

const trainerMeta: TrainerMetaPayload = {
    session: { instanceId: 'i' },
    trainer: {
        trainerId: 'trainer',
        gameId: 'game-1',
        displayName: 'Test Game',
        trainerLoading: false,
        gameInstalled: true,
        needsCompatibilityWarning: false,
        isTimeLimitExpired: false,
    },
    schema: {
        categories: ['player'],
        cheats: [
            {
                uuid: 'g',
                target: 'god',
                type: ECheatType.Toggle,
                name: 'God Mode',
                category: 'player',
                args: {},
            },
            {
                uuid: 's',
                target: 'speed',
                type: ECheatType.Slider,
                name: 'Game Speed',
                category: 'player',
                args: { min: 0, max: 10, step: 0.5 },
            },
            {
                uuid: 'h',
                target: 'heal',
                type: ECheatType.Button,
                name: 'Heal',
                category: 'player',
                args: {},
            },
            {
                uuid: 'w',
                target: 'weather',
                type: ECheatType.Selection,
                name: 'Weather',
                category: 'world',
                args: {
                    options: [
                        { label: 'Sun', value: 'sun' },
                        { label: 'Rain', value: 'rain' },
                        { label: 'Snow', value: 'snow' },
                    ],
                },
            },
        ],
    },
};

function setup(overrides: Partial<OscBotConfig> = {}, { failBind = false } = {}) {
    const sockets: FakeSocket[] = [];
    const values: Record<string, unknown> = { god: false, speed: 1, heal: 0, weather: 'sun' };
    const writes: { target: string; value: unknown }[] = [];
    const commands: { action: string; gameId: string | null }[] = [];
    const published: { type: string; payload: any }[] = [];
    let saved: OscBotConfig | null = null;
    const host: OscBotHost = {
        getTrainerMeta: () => trainerMeta,
        getValues: () => values,
        getGameStatus: () => null,
        getInstalledApps: () => [
            {
                platform: 'steam',
                sku: '1',
                correlationId: 'c',
                displayName: 'Elden Ring',
                gameId: 'elden',
            },
        ],
        setValue: async (target, value) => {
            writes.push({ target, value });
            return true;
        },
        runCommand: async (action, gameId) => {
            commands.push({ action, gameId });
            return true;
        },
    };
    const config: OscBotConfig = {
        ...createDefaultOscConfig(),
        enabled: true,
        throttleMs: 0,
        targets: [
            {
                id: 'vrc',
                name: 'VRChat',
                host: '127.0.0.1',
                port: 9000,
                enabled: true,
                chatbox: true,
                state: true,
                bindings: true,
            },
        ],
        ...overrides,
    };
    const bot = createOscBot({
        host,
        log: () => undefined,
        store: {
            file: null,
            load: () => config,
            save: (next) => {
                saved = next;
                return true;
            },
        },
        publish: (type, payload) => published.push({ type, payload }),
        createSocket: () => {
            // The bot creates the send socket first, then the listen socket.
            const socket = new FakeSocket(failBind && sockets.length === 1);
            sockets.push(socket);
            return socket;
        },
    });

    return {
        bot,
        values,
        writes,
        commands,
        published,
        getSaved: () => saved,
        get sender() {
            return sockets[sockets.length - 2];
        },
        get listener() {
            return sockets[sockets.length - 1];
        },
    };
}

describe('osc bot', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 9, 22, 12, 0, 0) }));
    afterEach(() => vi.useRealTimers());

    it('listens on loopback by default and reports listening', async () => {
        const harness = setup();
        await vi.advanceTimersByTimeAsync(0);
        expect(harness.listener.bound).toEqual({ port: 9001, address: '127.0.0.1' });
        expect(harness.bot.getState().status.state).toBe(EOscBotState.Listening);
        harness.bot.close();
    });

    it('falls back to send-only when the port is taken', async () => {
        const harness = setup({}, { failBind: true });
        await vi.advanceTimersByTimeAsync(0);
        const status = harness.bot.getState().status;
        expect(status.state).toBe(EOscBotState.SendOnly);
        expect(status.error).toContain('9001');
        harness.bot.runCommand({ action: 'chatbox_send', text: 'still here' });
        await vi.advanceTimersByTimeAsync(2000);
        expect(harness.sender.sent.some((packet) => packet.args[0] === 'still here')).toBe(true);
        harness.bot.close();
    });

    it('routes auto-mapped addresses to trainer writes', async () => {
        const harness = setup({ chatbox: { ...createDefaultOscConfig().chatbox, enabled: false } });
        await vi.advanceTimersByTimeAsync(0);

        harness.listener.receive('/wand/cheat/god', [{ type: 'i', value: 1 }]);
        harness.listener.receive('/wand/cheat/game_speed', [{ type: 'f', value: 3.3 }]);
        harness.listener.receive('/wand/cheat/heal/toggle', [{ type: 'T', value: true }]);
        harness.listener.receive('/wand/cheat/weather/inc', []);
        harness.listener.receive('/wand/launch', [{ type: 's', value: 'elden ring' }]);
        await vi.advanceTimersByTimeAsync(0);

        expect(harness.writes).toEqual([
            { target: 'god', value: true },
            { target: 'speed', value: 3.5 },
            { target: 'heal', value: 1 },
            { target: 'weather', value: 'rain' },
        ]);
        expect(harness.commands).toEqual([{ action: 'launch', gameId: 'elden' }]);
        harness.bot.close();
    });

    it('runs bindings with rescaling, hold and rising-edge triggers', async () => {
        const harness = setup({
            bindings: [
                createOscBinding({
                    address: '/avatar/parameters/WandSpeed',
                    action: EOscAction.Set,
                    target: 'speed',
                    rescale: true,
                    inputMin: 0,
                    inputMax: 1,
                }),
                createOscBinding({
                    address: '/avatar/parameters/God',
                    action: EOscAction.Hold,
                    target: 'god',
                }),
                createOscBinding({
                    address: '/btn/*',
                    action: EOscAction.Toggle,
                    target: null,
                    cheatName: 'god mode',
                }),
            ],
            chatbox: { ...createDefaultOscConfig().chatbox, enabled: false },
        });
        await vi.advanceTimersByTimeAsync(0);

        harness.listener.receive('/avatar/parameters/WandSpeed', [{ type: 'f', value: 0.25 }]);
        harness.listener.receive('/avatar/parameters/God', [{ type: 'T', value: true }]);
        harness.values.god = true;
        vi.advanceTimersByTime(2500);
        // Release (0) is ignored by a toggle; only the press flips it.
        harness.listener.receive('/btn/1', [{ type: 'f', value: 0 }]);
        harness.listener.receive('/btn/1', [{ type: 'f', value: 1 }]);
        await vi.advanceTimersByTimeAsync(0);

        expect(harness.writes).toEqual([
            { target: 'speed', value: 2.5 },
            { target: 'god', value: true },
            { target: 'god', value: false },
        ]);
        harness.bot.close();
    });

    it('skips writes that would not change anything, breaking echo loops', async () => {
        const harness = setup({
            bindings: [
                createOscBinding({
                    address: '/god',
                    action: EOscAction.Hold,
                    target: 'god',
                    feedback: true,
                }),
            ],
            chatbox: { ...createDefaultOscConfig().chatbox, enabled: false },
        });
        await vi.advanceTimersByTimeAsync(0);

        harness.listener.receive('/god', [{ type: 'F', value: false }]);
        await vi.advanceTimersByTimeAsync(0);
        expect(harness.writes).toEqual([]);

        harness.bot.handleEvent({ type: 'value', target: 'god', value: true });
        const feedback = harness.sender.sent.filter((packet) => packet.address === '/god');
        // Echoed with the type the controller used (it sent F, a boolean).
        expect(feedback.at(-1)?.args).toEqual([true]);
        expect(harness.sender.sent.some((packet) => packet.address === '/wand/cheat/god')).toBe(
            true,
        );
        harness.bot.close();
    });

    it('coalesces fader floods per target', async () => {
        const harness = setup({
            throttleMs: 50,
            chatbox: { ...createDefaultOscConfig().chatbox, enabled: false },
        });
        await vi.advanceTimersByTimeAsync(0);

        for (const value of [2, 3, 4, 5, 6]) {
            harness.listener.receive('/wand/cheat/speed', [{ type: 'f', value }]);
        }
        await vi.advanceTimersByTimeAsync(60);

        expect(harness.writes).toEqual([
            { target: 'speed', value: 2 },
            { target: 'speed', value: 6 },
        ]);
        harness.bot.close();
    });

    it('rotates chatbox templates and spaces announcements', async () => {
        const harness = setup({
            chatbox: {
                ...createDefaultOscConfig().chatbox,
                intervalSeconds: 5,
                messages: ['A {game}', '{mods_list}', 'C {mods_on}'],
                announceTemplate: '{last_mod}: {last_value}',
            },
        });
        await vi.advanceTimersByTimeAsync(0);
        const chatbox = () =>
            harness.sender.sent
                .filter((packet) => packet.address === '/chatbox/input')
                .map((packet) => packet.args[0]);

        expect(chatbox()).toEqual(['A Test Game']);
        // '{mods_list}' renders empty with nothing on, so the rotation skips it.
        await vi.advanceTimersByTimeAsync(5000);
        expect(chatbox()).toEqual(['A Test Game', 'C 0']);
        await vi.advanceTimersByTimeAsync(2000);

        harness.values.god = true;
        harness.bot.handleEvent({ type: 'value', target: 'god', value: true });
        expect(chatbox().at(-1)).toBe('God Mode: ON');

        // A second change inside VRChat's spam window waits instead of being dropped.
        harness.bot.handleEvent({ type: 'value', target: 'speed', value: 2 });
        expect(chatbox().at(-1)).toBe('God Mode: ON');
        await vi.advanceTimersByTimeAsync(1600);
        expect(chatbox().at(-1)).toBe('Game Speed: 2');
        harness.bot.close();
    });

    it('clears the chatbox when stopped and persists config updates', async () => {
        const harness = setup();
        await vi.advanceTimersByTimeAsync(0);
        const sender = harness.sender;

        harness.bot.updateConfig({ ...harness.bot.getState().config, enabled: false }, 'req-1');
        expect(sender.sent.at(-1)).toMatchObject({
            address: '/chatbox/input',
            args: ['', true, false],
        });
        expect(harness.getSaved()?.enabled).toBe(false);
        expect(harness.bot.getState().status.state).toBe(EOscBotState.Disabled);
        const state = harness.published.filter((entry) => entry.type === 'osc_state').at(-1);
        expect(state?.payload.config.enabled).toBe(false);
        harness.bot.close();
    });

    it('logs routed messages and folds repeats', async () => {
        const harness = setup({ chatbox: { ...createDefaultOscConfig().chatbox, enabled: false } });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener.receive('/wand/cheat/nope', [{ type: 'i', value: 1 }]);
        harness.listener.receive('/wand/cheat/nope', [{ type: 'i', value: 1 }]);
        await vi.advanceTimersByTimeAsync(250);

        const incoming = harness.bot
            .getState()
            .activity.filter((entry) => entry.direction === 'in');
        expect(incoming).toHaveLength(1);
        expect(incoming[0]).toMatchObject({ count: 2, failed: true, note: 'Unknown mod "nope"' });
        expect(harness.published.some((entry) => entry.type === 'osc_activity')).toBe(true);
        harness.bot.close();
    });

    it('answers queries to the sender', async () => {
        const harness = setup({
            targets: [],
            chatbox: { ...createDefaultOscConfig().chatbox, enabled: false },
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener.receive('/wand/query', [], { address: '10.0.0.9', port: 7000 });

        const replies = harness.listener.sent.filter((packet) => packet.host === '10.0.0.9');
        expect(replies.map((packet) => packet.address)).toContain('/wand/cheat/speed');
        expect(replies.find((packet) => packet.address === '/wand/game/title')?.args).toEqual([
            'Test Game',
        ]);
        harness.bot.close();
    });
});
