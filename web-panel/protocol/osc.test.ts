import { describe, expect, it } from 'vitest';

import {
    buildChatboxContext,
    chatboxLength,
    fitChatbox,
    renderChatboxTemplate,
} from './chatbox-template';
import { PROTOCOL_VERSION } from './contract';
import { ECheatType, type TrainerMetaPayload } from './messages';
import {
    createDefaultOscConfig,
    EOscAction,
    normalizeOscConfig,
    OSC_LIMITS,
    slugifyCheatName,
} from './osc';
import { isIncomingMessage, isOutgoingMessage } from './validation';

const trainerMeta: TrainerMetaPayload = {
    session: { instanceId: 'i' },
    trainer: {
        trainerId: 't1',
        gameId: 'g1',
        displayName: 'Elden Ring',
        gameVersion: '1.10',
        trainerLoading: false,
        gameInstalled: true,
        needsCompatibilityWarning: false,
        isTimeLimitExpired: false,
    },
    schema: {
        categories: ['player'],
        cheats: [
            {
                uuid: 'a',
                target: 'god',
                type: ECheatType.Toggle,
                name: 'God Mode',
                category: 'player',
                args: {},
            },
            {
                uuid: 'b',
                target: 'speed',
                type: ECheatType.Slider,
                name: 'Game Speed',
                category: 'player',
                args: { min: 0, max: 5, step: 0.1, postfix: 'x' },
            },
            {
                uuid: 'c',
                target: 'stamina',
                type: ECheatType.Toggle,
                name: 'Unlimited Stamina',
                category: 'player',
                args: {},
            },
        ],
    },
};

describe('osc config normalization', () => {
    it('returns defaults for garbage and keeps the bot opt-in', () => {
        const config = normalizeOscConfig('nope');
        expect(config).toEqual(createDefaultOscConfig());
        expect(config.enabled).toBe(false);
        expect(config.allowLan).toBe(false);
    });

    it('drops invalid entries instead of rejecting the profile', () => {
        const config = normalizeOscConfig({
            enabled: true,
            listenPort: 70000,
            prefix: 'no-slash',
            throttleMs: 99999,
            targets: [
                { id: 'ok', host: '192.168.1.20', port: 8000, state: true },
                { id: 'bad', host: 'evil host/../', port: 1 },
                { id: 'bad-port', host: '127.0.0.1', port: 0 },
            ],
            bindings: [
                { id: 'x', address: '/avatar/parameters/God', action: 'hold', target: 'god' },
                { id: 'x', address: '/dup/id', action: 'toggle' },
                { address: 'missing-slash', action: 'toggle' },
                { address: '/unknown/action', action: 'explode' },
            ],
            chatbox: { intervalSeconds: 0, messages: ['a', 3, 'b'] },
        });

        expect(config.enabled).toBe(true);
        expect(config.listenPort).toBe(9001);
        expect(config.prefix).toBe('/wand');
        expect(config.throttleMs).toBe(OSC_LIMITS.maxThrottleMs);
        expect(config.targets.map((target) => target.id)).toEqual(['ok']);
        expect(config.targets[0]).toMatchObject({ state: true, chatbox: false, enabled: true });
        expect(config.bindings).toHaveLength(2);
        expect(config.bindings[0]).toMatchObject({ id: 'x', action: EOscAction.Hold });
        expect(config.bindings[1].id).not.toBe('x');
        expect(config.chatbox.intervalSeconds).toBe(OSC_LIMITS.minIntervalSeconds);
        expect(config.chatbox.messages).toEqual(['a', 'b']);
    });

    it('slugifies cheat names into address aliases', () => {
        expect(slugifyCheatName('Infinite Health')).toBe('infinite_health');
        expect(slugifyCheatName('  Café +10% Speed! ')).toBe('cafe_10_speed');
    });
});

describe('chatbox templates', () => {
    const now = new Date(2026, 9, 22, 21, 5, 9);
    const context = buildChatboxContext({
        trainerMeta,
        values: { god: true, speed: 2.5, stamina: false },
        gameStatus: null,
        lastChange: { target: 'speed', value: 2.5 },
        uptimeSeconds: 3725,
        now,
    });

    it('renders live trainer tokens', () => {
        expect(
            renderChatboxTemplate(
                '{game} v{version} · {mods_on}/{mods_total} {mods_bar}\n{mods_list}',
                context,
            ),
        ).toBe('Elden Ring v1.10 · 1/3 ▰▰▰▱▱▱▱▱\nGod Mode');
        expect(renderChatboxTemplate('{last_mod} → {last_value}', context)).toBe(
            'Game Speed → 2.5x',
        );
        expect(renderChatboxTemplate('{time} {time12} {date} {uptime}', context)).toBe(
            '21:05 9:05 PM 2026-10-22 1:02:05',
        );
        expect(renderChatboxTemplate('{value:god}/{value:missing}', context)).toBe('ON/—');
    });

    it('keeps unknown tokens verbatim', () => {
        expect(renderChatboxTemplate('{nope} {game}', context)).toBe('{nope} Elden Ring');
    });

    it('fits VRChat limits by characters and lines', () => {
        const long = fitChatbox('x'.repeat(400));
        expect(chatboxLength(long)).toBe(OSC_LIMITS.chatboxMaxChars);
        expect(long.endsWith('…')).toBe(true);
        expect(fitChatbox('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11').split('\n')).toHaveLength(
            OSC_LIMITS.chatboxMaxLines,
        );
        expect(fitChatbox('emoji 🎮 counts once')).toBe('emoji 🎮 counts once');
    });

    it('is idle without a trainer or running session', () => {
        const idle = buildChatboxContext({
            trainerMeta: null,
            values: {},
            gameStatus: null,
            lastChange: null,
            uptimeSeconds: 0,
            now,
        });
        expect(idle.active).toBe(false);
        expect(renderChatboxTemplate('{game}', idle)).toBe('Wand');
    });
});

describe('osc protocol messages', () => {
    const envelope = (type: string, payload: unknown) => ({
        type,
        version: PROTOCOL_VERSION,
        requestId: null,
        payload,
    });

    it('validates bot state broadcasts', () => {
        const status = {
            state: 'listening',
            packetsIn: 1,
            packetsOut: 2,
            history: [],
        };
        expect(
            isIncomingMessage(
                envelope('osc_state', { config: createDefaultOscConfig(), status, activity: [] }),
            ),
        ).toBe(true);
        expect(isIncomingMessage(envelope('osc_status', { status: { state: 'x' } }))).toBe(false);
    });

    it('validates panel commands', () => {
        expect(isOutgoingMessage(envelope('osc_config', { config: {} }))).toBe(true);
        expect(
            isOutgoingMessage(envelope('osc_command', { action: 'send', address: '/a', args: [] })),
        ).toBe(true);
        expect(isOutgoingMessage(envelope('osc_command', { action: 'chatbox_send' }))).toBe(false);
        expect(isOutgoingMessage(envelope('osc_command', { action: 'format_disk' }))).toBe(false);
    });
});
