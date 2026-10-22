import type {
    GameStatusPayload,
    InstalledAppSummary,
    InstalledAppsPayload,
    OscCommandAction,
    OscStatePayload,
    TrainerMetaPayload,
} from '../../protocol/messages';
import {
    normalizeOscConfig,
    type OscActivityEntry,
    type OscBotConfig,
    type OscBotStatus,
} from '../../protocol/osc';
import { readInitialWebSocketUrl } from './remote-session.urls';

const OSC_ACTIVITY_LIMIT = 300;

export enum EConnectionStatus {
    Idle = 'idle',
    Connecting = 'connecting',
    Reconnecting = 'reconnecting',
    Connected = 'connected',
    Error = 'error',
}

export type PendingWrite = {
    requestId: string;
    value: unknown;
    previousConfirmedValue: unknown;
};

export type OscNotice = {
    id: number;
    ok: boolean;
    action: OscCommandAction;
    message: string | null;
};

export type OscSessionState = {
    config: OscBotConfig;
    status: OscBotStatus;
    activity: OscActivityEntry[];
    /** Local edits not sent yet: an incoming config must not clobber what the user is typing. */
    draftPending: boolean;
    /** The config update the bridge has not acknowledged yet. */
    awaitingRequestId: string | null;
    notice: OscNotice | null;
};

export type RemoteSessionState = {
    connectionStatus: EConnectionStatus;
    wsUrl: string;
    trainerMeta: TrainerMetaPayload | null;
    gameStatus: GameStatusPayload | null;
    installedApps: InstalledAppSummary[];
    values: Record<string, unknown>;
    confirmedValues: Record<string, unknown>;
    pendingWrites: Record<string, PendingWrite>;
    /** The most recent confirmed change, for `{last_mod}` in chatbox previews. */
    lastChange: { target: string; value: unknown } | null;
    osc: OscSessionState | null;
    lastError: string | null;
};

export type RemoteSessionAction =
    | { type: 'setWsUrl'; wsUrl: string }
    | { type: 'connecting'; reconnecting?: boolean }
    | { type: 'connected' }
    | { type: 'connectionClosed'; message: string }
    | { type: 'disconnected' }
    | { type: 'trainerMeta'; payload: TrainerMetaPayload }
    | { type: 'gameStatus'; payload: GameStatusPayload }
    | { type: 'installedApps'; payload: InstalledAppsPayload }
    | { type: 'trainerValues'; payload: Record<string, unknown> }
    | { type: 'valueChanged'; target: string; value: unknown }
    | { type: 'writeStarted'; target: string; value: unknown; requestId: string }
    | {
          type: 'writeResult';
          target: string;
          requestId: string | null;
          ok: boolean;
          message?: string;
      }
    | { type: 'trainerChanged' }
    | { type: 'oscState'; payload: OscStatePayload; requestId: string | null }
    | { type: 'oscStatus'; status: OscBotStatus }
    | { type: 'oscActivity'; entries: OscActivityEntry[] }
    | { type: 'oscConfigEdited'; config: OscBotConfig }
    | { type: 'oscConfigSent'; requestId: string }
    | { type: 'oscNotice'; ok: boolean; action: OscCommandAction; message: string | null }
    | { type: 'error'; message: string | null };

export function createInitialRemoteSessionState(): RemoteSessionState {
    return {
        connectionStatus: EConnectionStatus.Idle,
        wsUrl: readInitialWebSocketUrl(),
        trainerMeta: null,
        gameStatus: null,
        installedApps: [],
        values: {},
        confirmedValues: {},
        pendingWrites: {},
        lastChange: null,
        osc: null,
        lastError: null,
    };
}

export function remoteSessionReducer(
    state: RemoteSessionState,
    action: RemoteSessionAction,
): RemoteSessionState {
    switch (action.type) {
        case 'setWsUrl':
            return { ...state, wsUrl: action.wsUrl };
        case 'connecting':
            return {
                ...state,
                connectionStatus: action.reconnecting
                    ? EConnectionStatus.Reconnecting
                    : EConnectionStatus.Connecting,
                lastError: null,
            };
        case 'connected':
            return { ...state, connectionStatus: EConnectionStatus.Connected, lastError: null };
        case 'connectionClosed':
            return {
                ...state,
                connectionStatus: EConnectionStatus.Reconnecting,
                pendingWrites: {},
                // The next hello snapshot is authoritative again.
                osc: state.osc
                    ? { ...state.osc, draftPending: false, awaitingRequestId: null }
                    : null,
                lastError: action.message,
            };
        case 'disconnected':
            return {
                ...state,
                connectionStatus: EConnectionStatus.Idle,
                trainerMeta: null,
                gameStatus: null,
                values: {},
                confirmedValues: {},
                pendingWrites: {},
                osc: null,
                lastError: null,
            };
        case 'trainerMeta':
            return { ...state, trainerMeta: action.payload, pendingWrites: {} };
        case 'gameStatus':
            return { ...state, gameStatus: action.payload };
        case 'installedApps':
            return { ...state, installedApps: action.payload.apps };
        case 'trainerValues':
            return {
                ...state,
                values: action.payload,
                confirmedValues: action.payload,
                pendingWrites: {},
            };
        case 'valueChanged':
            return {
                ...applyConfirmedValue(state, action.target, action.value),
                lastChange: { target: action.target, value: action.value },
            };
        case 'writeStarted':
            return {
                ...state,
                values: { ...state.values, [action.target]: action.value },
                pendingWrites: {
                    ...state.pendingWrites,
                    [action.target]: {
                        requestId: action.requestId,
                        value: action.value,
                        previousConfirmedValue: state.confirmedValues[action.target],
                    },
                },
            };
        case 'writeResult':
            return applyWriteResult(state, action);
        case 'trainerChanged':
            return {
                ...state,
                lastChange: null,
                trainerMeta: null,
                values: {},
                confirmedValues: {},
                pendingWrites: {},
            };
        case 'oscState':
            return { ...state, osc: applyOscState(state.osc, action.payload, action.requestId) };
        case 'oscStatus':
            return state.osc ? { ...state, osc: { ...state.osc, status: action.status } } : state;
        case 'oscActivity':
            return state.osc
                ? {
                      ...state,
                      osc: {
                          ...state.osc,
                          activity: mergeOscActivity(state.osc.activity, action.entries),
                      },
                  }
                : state;
        case 'oscConfigEdited':
            return state.osc
                ? { ...state, osc: { ...state.osc, config: action.config, draftPending: true } }
                : state;
        case 'oscConfigSent':
            return state.osc
                ? {
                      ...state,
                      osc: {
                          ...state.osc,
                          draftPending: false,
                          awaitingRequestId: action.requestId,
                      },
                  }
                : state;
        case 'oscNotice':
            return state.osc
                ? {
                      ...state,
                      osc: {
                          ...state.osc,
                          notice: {
                              id: (state.osc.notice?.id ?? 0) + 1,
                              ok: action.ok,
                              action: action.action,
                              message: action.message,
                          },
                      },
                  }
                : state;
        case 'error':
            return {
                ...state,
                connectionStatus:
                    action.message && state.connectionStatus !== EConnectionStatus.Connected
                        ? EConnectionStatus.Error
                        : state.connectionStatus,
                lastError: action.message,
            };
    }
}

function applyConfirmedValue(
    state: RemoteSessionState,
    target: string,
    value: unknown,
): RemoteSessionState {
    const pending = state.pendingWrites[target];
    const pendingWrites = { ...state.pendingWrites };
    if (pending && Object.is(pending.value, value)) {
        delete pendingWrites[target];
    }

    return {
        ...state,
        values: { ...state.values, [target]: value },
        confirmedValues: { ...state.confirmedValues, [target]: value },
        pendingWrites,
    };
}

function applyWriteResult(
    state: RemoteSessionState,
    action: Extract<RemoteSessionAction, { type: 'writeResult' }>,
): RemoteSessionState {
    const pending = state.pendingWrites[action.target];
    if (!pending || !action.requestId || pending.requestId !== action.requestId) {
        return state;
    }

    const pendingWrites = { ...state.pendingWrites };
    delete pendingWrites[action.target];

    if (action.ok) {
        return {
            ...state,
            confirmedValues: { ...state.confirmedValues, [action.target]: pending.value },
            pendingWrites,
        };
    }

    return {
        ...state,
        values: { ...state.values, [action.target]: pending.previousConfirmedValue },
        pendingWrites,
        lastError: action.message ?? 'The trainer rejected the requested value.',
    };
}

function applyOscState(
    current: OscSessionState | null,
    payload: OscStatePayload,
    requestId: string | null,
): OscSessionState {
    const keepLocalConfig = Boolean(
        current &&
            (current.draftPending ||
                (current.awaitingRequestId !== null && requestId !== current.awaitingRequestId)),
    );

    return {
        config: keepLocalConfig && current ? current.config : normalizeOscConfig(payload.config),
        status: payload.status,
        activity: mergeOscActivity([], payload.activity),
        draftPending: current?.draftPending ?? false,
        awaitingRequestId: keepLocalConfig ? (current?.awaitingRequestId ?? null) : null,
        notice: current?.notice ?? null,
    };
}

/** Entries are upserted by id: the bridge re-sends an entry when it folds a repeat into it. */
export function mergeOscActivity(
    current: OscActivityEntry[],
    incoming: OscActivityEntry[],
): OscActivityEntry[] {
    if (incoming.length === 0) {
        return current;
    }

    const byId = new Map(current.map((entry) => [entry.id, entry]));
    for (const entry of incoming) {
        if (entry && typeof entry.id === 'number') {
            byId.set(entry.id, entry);
        }
    }

    return Array.from(byId.values())
        .sort((left, right) => left.id - right.id)
        .slice(-OSC_ACTIVITY_LIMIT);
}
