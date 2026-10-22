import { useCallback, useMemo, useState } from 'react';

import { ECheatType } from '../../protocol/messages';
import { buildLibraryGames, getCurrentGame, type LibraryGame } from '../library/model/games';
import { useGamePins } from '../library/pinned-games/use-game-pins';
import type { OscStudioSession } from '../osc-bot/model/use-osc-studio';
import { useRemoteSession } from '../remote-session/use-remote-session';
import { loadString, saveString } from '../shared/storage';
import { buildPinnedGroup, filterGroups, groupCheatsByCategory } from '../trainer/model/categories';
import { getPinnedStorageKey } from '../trainer/pinned-cheats/pinned-cheat-storage';
import { usePinnedCheats } from '../trainer/pinned-cheats/use-pinned-cheats';
import { getPresetStorageKey, type RemotePreset } from '../trainer/presets/preset-storage';
import { usePresets } from '../trainer/presets/use-presets';
import { useDockAutoHide } from './use-dock-auto-hide';

// String values are persisted per device; do not rename the right-hand side.
export enum EPanelView {
    Mods = 'mods',
    Osc = 'osc',
}

const VIEW_STORAGE_KEY = 'wand-remote.view.v1';

function loadView(): EPanelView {
    return loadString(VIEW_STORAGE_KEY) === EPanelView.Osc ? EPanelView.Osc : EPanelView.Mods;
}

export function useRemotePanel() {
    const session = useRemoteSession();
    const [cheatQuery, setCheatQuery] = useState('');
    const [gameQuery, setGameQuery] = useState('');
    const [leftOpen, setLeftOpen] = useState(false);
    const [rightOpen, setRightOpen] = useState(false);
    const [view, setViewState] = useState(loadView);
    const dock = useDockAutoHide();

    const setView = useCallback((next: EPanelView) => {
        setViewState(next);
        saveString(VIEW_STORAGE_KEY, next);
    }, []);

    const activeTrainer = session.state.trainerMeta?.trainer ?? null;
    const { pinnedGameIds, togglePin: toggleGamePin } = useGamePins();
    const libraryGames = useMemo(
        () =>
            buildLibraryGames(
                session.state.installedApps,
                session.state.gameStatus,
                activeTrainer,
                pinnedGameIds,
            ),
        [activeTrainer, pinnedGameIds, session.state.gameStatus, session.state.installedApps],
    );
    const currentGame = useMemo(() => getCurrentGame(libraryGames), [libraryGames]);

    const pinnedStorageKey = useMemo(() => getPinnedStorageKey(activeTrainer), [activeTrainer]);
    const { pinnedTargets, toggle: togglePinnedCheat } = usePinnedCheats({ pinnedStorageKey });
    const groups = useMemo(
        () => groupCheatsByCategory(session.state.trainerMeta),
        [session.state.trainerMeta],
    );
    const pinnedGroup = useMemo(
        () => buildPinnedGroup(session.state.trainerMeta, pinnedTargets),
        [pinnedTargets, session.state.trainerMeta],
    );
    const filteredGroups = useMemo(() => filterGroups(groups, cheatQuery), [cheatQuery, groups]);
    const filteredPinnedGroup = useMemo(
        () => (pinnedGroup ? (filterGroups([pinnedGroup], cheatQuery)[0] ?? null) : null),
        [cheatQuery, pinnedGroup],
    );

    const presetStorageKey = useMemo(() => getPresetStorageKey(activeTrainer), [activeTrainer]);
    const presets = usePresets({
        presetStorageKey,
        trainerMeta: session.state.trainerMeta,
        values: session.state.values,
        onError: session.reportError,
    });

    const { changeCheat, launchGame } = session;
    const { trainerMeta, values } = session.state;

    const panic = useCallback(() => {
        if (!trainerMeta) return;
        for (const cheat of trainerMeta.schema.cheats) {
            if (cheat.type === ECheatType.Toggle && values[cheat.target]) {
                changeCheat(cheat, false);
            }
        }
    }, [trainerMeta, values, changeCheat]);

    const applyPreset = useCallback(
        (preset: RemotePreset) => {
            if (!trainerMeta) return;
            for (const cheat of trainerMeta.schema.cheats) {
                if (cheat.target in preset.values) {
                    changeCheat(cheat, preset.values[cheat.target]);
                }
            }
        },
        [trainerMeta, changeCheat],
    );

    const playGame = useCallback(
        (game: LibraryGame) => {
            if (launchGame(game.app)) {
                setRightOpen(false);
            }
        },
        [launchGame],
    );

    const launchableGames = useMemo(
        () =>
            libraryGames
                .filter((game) => game.gameId)
                .map((game) => ({ gameId: game.gameId as string, title: game.title })),
        [libraryGames],
    );

    const oscSession: OscStudioSession = {
        connected: session.connected,
        osc: session.state.osc,
        trainerMeta,
        values,
        gameStatus: session.state.gameStatus,
        lastChange: session.state.lastChange,
        launchableGames,
        editOscConfig: session.editOscConfig,
        sendOscCommand: session.sendOscCommand,
    };

    const totalVisibleCheats = filteredGroups.reduce(
        (count, group) => count + group.cheats.length,
        filteredPinnedGroup?.cheats.length ?? 0,
    );

    return {
        session: {
            status: session.state.connectionStatus,
            wsUrl: session.state.wsUrl,
            lastError: session.state.lastError,
            values: session.state.values,
            pendingTargets: session.pendingTargets,
            connected: session.connected,
            connect: session.connect,
            disconnect: session.disconnect,
            setWsUrl: session.setWsUrl,
        },
        trainer: {
            activeTrainer,
            query: cheatQuery,
            setQuery: setCheatQuery,
            filteredGroups,
            filteredPinnedGroup,
            pinnedTargets,
            controlsDisabled: Boolean(
                activeTrainer?.trainerLoading || activeTrainer?.isTimeLimitExpired,
            ),
            totalVisibleCheats,
            totalCheats: session.state.trainerMeta?.schema.cheats.length ?? 0,
            changeCheat: session.changeCheat,
            togglePin: togglePinnedCheat,
            panic,
            presets: presets.presets,
            addPreset: presets.addPreset,
            applyPreset,
            deletePreset: presets.deletePreset,
        },
        library: {
            games: libraryGames,
            currentGame,
            pinnedGameIds,
            query: gameQuery,
            setQuery: setGameQuery,
            togglePin: toggleGamePin,
            playGame,
            stopPlaying: session.stopPlaying,
        },
        osc: {
            session: oscSession,
            state: session.state.osc?.status.state ?? null,
            enabled: Boolean(session.state.osc?.config.enabled),
        },
        shell: {
            view,
            setView,
            leftOpen,
            rightOpen,
            openSettings: () => setLeftOpen(true),
            closeSettings: () => setLeftOpen(false),
            openLibrary: () => setRightOpen(true),
            closeLibrary: () => setRightOpen(false),
            dockHidden: dock.hidden,
            onScroll: dock.onScroll,
        },
    };
}
