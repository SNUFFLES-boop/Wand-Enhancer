import { describe, expect, it } from 'vitest';

import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import {
    createDefaultOscConfig,
    createOscBinding,
    EOscAction,
    EOscBotState,
    EOscDirection,
    type OscActivityEntry,
    type OscBotStatus,
} from '../../../protocol/osc';
import {
    createInitialRemoteSessionState,
    mergeOscActivity,
    type RemoteSessionState,
    remoteSessionReducer,
} from '../../remote-session/remote-session.reducer';
import {
    avatarParameterAddress,
    bindingFromActivity,
    generateAvatarBindings,
    isCheatCompatible,
} from './bindings';
import { parseOscArgs } from './osc-args';
import { EStudioSection, loadStudioLayout, moveSection, toggleSectionFlag } from './studio-layout';
import { isVrchatNoise } from './vrchat-noise';

const status: OscBotStatus = {
    state: EOscBotState.Listening,
    listenAddress: '127.0.0.1:9001',
    error: null,
    startedAt: null,
    packetsIn: 0,
    packetsOut: 0,
    errors: 0,
    history: [],
    lastChatbox: null,
    lastChatboxAt: null,
};

const cheat = (target: string, type: ECheatType, name = target): CheatSchema => ({
    uuid: target,
    target,
    type,
    name,
    category: 'player',
    args: type === ECheatType.Slider ? { min: 0, max: 10 } : {},
});

const entry = (id: number, patch: Partial<OscActivityEntry> = {}): OscActivityEntry => ({
    id,
    at: id,
    direction: EOscDirection.In,
    address: `/a/${id}`,
    args: [],
    peer: '',
    count: 1,
    ...patch,
});

function withOsc(): RemoteSessionState {
    return remoteSessionReducer(createInitialRemoteSessionState(), {
        type: 'oscState',
        payload: { config: createDefaultOscConfig(), status, activity: [entry(1)] },
        requestId: null,
    });
}

describe('osc session state', () => {
    it('keeps unsent and unacknowledged edits over incoming configs', () => {
        let state = withOsc();
        const edited = { ...createDefaultOscConfig(), listenPort: 7000 };
        state = remoteSessionReducer(state, { type: 'oscConfigEdited', config: edited });

        const stale = { config: createDefaultOscConfig(), status, activity: [] };
        state = remoteSessionReducer(state, { type: 'oscState', payload: stale, requestId: null });
        expect(state.osc?.config.listenPort).toBe(7000);

        state = remoteSessionReducer(state, { type: 'oscConfigSent', requestId: 'mine' });
        state = remoteSessionReducer(state, {
            type: 'oscState',
            payload: stale,
            requestId: 'other',
        });
        expect(state.osc?.config.listenPort).toBe(7000);

        state = remoteSessionReducer(state, {
            type: 'oscState',
            payload: { ...stale, config: edited },
            requestId: 'mine',
        });
        expect(state.osc?.config.listenPort).toBe(7000);
        expect(state.osc?.awaitingRequestId).toBeNull();

        state = remoteSessionReducer(state, { type: 'oscState', payload: stale, requestId: null });
        expect(state.osc?.config.listenPort).toBe(9001);
    });

    it('upserts folded activity entries in order and caps the log', () => {
        const merged = mergeOscActivity([entry(1), entry(2)], [entry(2, { count: 5 }), entry(3)]);
        expect(merged.map((item) => [item.id, item.count])).toEqual([
            [1, 1],
            [2, 5],
            [3, 1],
        ]);
        const many = Array.from({ length: 400 }, (_, index) => entry(index + 1));
        expect(mergeOscActivity([], many)).toHaveLength(300);
    });

    it('drops the bot state on disconnect and tracks the last change', () => {
        let state = withOsc();
        state = remoteSessionReducer(state, { type: 'valueChanged', target: 'god', value: true });
        expect(state.lastChange).toEqual({ target: 'god', value: true });
        state = remoteSessionReducer(state, { type: 'disconnected' });
        expect(state.osc).toBeNull();
    });
});

describe('composer arguments', () => {
    it('infers OSC types and honours explicit prefixes', () => {
        expect(parseOscArgs('1 0.5 -2 true F nil "two words" i:3.9 f:1 s:42 hi')).toEqual([
            { type: 'i', value: 1 },
            { type: 'f', value: 0.5 },
            { type: 'i', value: -2 },
            { type: 'T', value: true },
            { type: 'F', value: false },
            { type: 'N', value: null },
            { type: 's', value: 'two words' },
            { type: 'i', value: 3 },
            { type: 'f', value: 1 },
            { type: 's', value: '42' },
            { type: 's', value: 'hi' },
        ]);
    });
});

describe('binding model', () => {
    const cheats = [
        cheat('god', ECheatType.Toggle, 'God Mode'),
        cheat('speed', ECheatType.Slider, 'Game Speed'),
        cheat('heal', ECheatType.Button, 'Heal'),
    ];

    it('generates one avatar parameter per mod without duplicates', () => {
        const existing = [createOscBinding({ address: '/avatar/parameters/WandGodMode' })];
        const created = generateAvatarBindings(cheats, existing);
        expect(created.map((binding) => [binding.address, binding.action])).toEqual([
            ['/avatar/parameters/WandGameSpeed', EOscAction.Set],
            ['/avatar/parameters/WandHeal', EOscAction.Press],
        ]);
        expect(created[0]).toMatchObject({ rescale: true, feedback: true, scope: null });
        expect(avatarParameterAddress('Café + 10% Speed')).toBe(
            '/avatar/parameters/WandCafe10Speed',
        );
    });

    it('shapes a binding after the traffic it was created from', () => {
        const fader = bindingFromActivity(
            { address: '/1/fader1', args: [{ type: 'f', value: 0.3 }] },
            cheats,
            'game',
        );
        expect(fader).toMatchObject({
            action: EOscAction.Set,
            target: 'speed',
            rescale: true,
            scope: 'game',
        });

        const avatarBool = bindingFromActivity(
            { address: '/avatar/parameters/X', args: [{ type: 'T', value: true }] },
            cheats,
            null,
        );
        expect(avatarBool).toMatchObject({ action: EOscAction.Hold, target: 'god' });
    });

    it('only offers compatible mods per action', () => {
        expect(isCheatCompatible(EOscAction.Hold, cheats[1])).toBe(false);
        expect(isCheatCompatible(EOscAction.Step, cheats[1])).toBe(true);
        expect(isCheatCompatible(EOscAction.Press, cheats[2])).toBe(true);
        expect(isCheatCompatible(EOscAction.Press, cheats[0])).toBe(false);
    });

    it('recognises VRChat built-in noise', () => {
        expect(isVrchatNoise('/avatar/parameters/VelocityX')).toBe(true);
        expect(isVrchatNoise('/avatar/parameters/Hair_Angle')).toBe(true);
        expect(isVrchatNoise('/avatar/parameters/WandGodMode')).toBe(false);
        expect(isVrchatNoise('/1/fader1')).toBe(false);
    });
});

describe('studio layout', () => {
    it('reorders, collapses and appends sections added later', () => {
        localStorage.setItem(
            'wand-remote.osc-studio-layout.v1',
            JSON.stringify({ order: ['monitor', 'bogus'], collapsed: ['chatbox'], hidden: [] }),
        );
        const layout = loadStudioLayout();
        expect(layout.order[0]).toBe(EStudioSection.Monitor);
        expect(layout.order).toHaveLength(Object.values(EStudioSection).length);
        expect(layout.collapsed).toEqual([EStudioSection.Chatbox]);

        const moved = moveSection(layout, EStudioSection.Monitor, 1);
        expect(moved.order[1]).toBe(EStudioSection.Monitor);
        expect(moveSection(layout, EStudioSection.Monitor, -1)).toBe(layout);
        expect(toggleSectionFlag(layout, 'hidden', EStudioSection.Network).hidden).toEqual([
            EStudioSection.Network,
        ]);
    });
});
