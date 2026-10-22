import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECheatType, type TrainerMetaPayload } from '../../../protocol/messages';
import { createDefaultOscConfig, createOscBinding, EOscBotState } from '../../../protocol/osc';
import type { OscStudioSession } from '../model/use-osc-studio';
import OscStudio from './OscStudio';

i18n.load('en', {});
i18n.activate('en');

const trainerMeta: TrainerMetaPayload = {
    session: { instanceId: 'i' },
    trainer: {
        trainerId: 't',
        gameId: 'g',
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
                uuid: 'god',
                target: 'god',
                type: ECheatType.Toggle,
                name: 'God Mode',
                category: 'player',
                args: {},
            },
        ],
    },
};

function renderStudio(enabled: boolean) {
    const editOscConfig = vi.fn();
    const config = {
        ...createDefaultOscConfig(),
        enabled,
        bindings: [createOscBinding({ target: 'god', cheatName: 'God Mode' })],
    };
    const session: OscStudioSession = {
        connected: true,
        osc: {
            config,
            status: {
                state: enabled ? EOscBotState.Listening : EOscBotState.Disabled,
                listenAddress: enabled ? '127.0.0.1:9001' : null,
                error: null,
                startedAt: null,
                packetsIn: 3,
                packetsOut: 1,
                errors: 0,
                history: [{ in: 3, out: 1 }],
                lastChatbox: null,
                lastChatboxAt: null,
            },
            activity: [],
            draftPending: false,
            awaitingRequestId: null,
            notice: null,
        },
        trainerMeta,
        values: { god: true },
        gameStatus: null,
        lastChange: null,
        launchableGames: [],
        editOscConfig,
        sendOscCommand: vi.fn(() => true),
    };
    render(
        <I18nProvider i18n={i18n}>
            <OscStudio session={session} />
        </I18nProvider>,
    );
    return { editOscConfig, config };
}

describe('OSC studio', () => {
    afterEach(cleanup);

    it('turns the bot on from the hero switch', () => {
        const { editOscConfig } = renderStudio(false);
        expect(screen.getByText('Bot is off')).toBeTruthy();

        fireEvent.click(screen.getByRole('switch', { name: 'Turn the OSC bot on' }));
        expect(editOscConfig).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true }),
            true,
        );
    });

    it('previews the chatbox with live tokens and opens the binding editor', () => {
        renderStudio(true);
        expect(screen.getByText('Listening')).toBeTruthy();
        expect(screen.getAllByText(/Test Game/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/1\/1 mods active/).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByText('/avatar/parameters/WandToggle'));
        expect(screen.getByRole('button', { name: /Learn/ })).toBeTruthy();
        expect(screen.getByText(/Wildcards work/).textContent).toContain('{a,b}');
    });
});
