import type { OscActivityEntry, OscArgPreview, OscBotConfig, OscBotStatus } from './osc';

export { PROTOCOL_VERSION } from './contract.js';

// String values mirror the wire protocol; do not rename the right-hand side.
export enum ECheatType {
    Slider = 'slider',
    Number = 'number',
    Toggle = 'toggle',
    Button = 'button',
    Selection = 'selection',
    Scalar = 'scalar',
    Incremental = 'incremental',
}

export interface CheatOption {
    label?: string;
    value: string | number;
}

export type CheatOptionLike = CheatOption | string | number;

export interface CheatArgs {
    min?: number;
    max?: number;
    step?: number;
    options?: CheatOptionLike[];
    button?: string | boolean;
    postfix?: string;
    default?: string | number | boolean;
}

export interface CheatSchema {
    uuid: string;
    target: string;
    type: ECheatType;
    name: string;
    description?: string | null;
    instructions?: string | null;
    category: string;
    parent?: string | null;
    flags?: number;
    hotkeys?: string[][];
    args: CheatArgs;
}

export interface InstalledAppSummary {
    platform: string;
    sku: string;
    correlationId: string;
    displayName: string;
    gameId?: string | null;
    titleId?: string | null;
    imageUrl?: string | null;
    platformLastPlayedTimestamp?: number | null;
    platformTotalPlaytimeMinutes?: number | null;
}

export interface InstalledAppsPayload {
    instanceId: string;
    updatedAt: string;
    apps: InstalledAppSummary[];
}

export interface GameSessionStatus {
    state: 'idle' | 'running';
    event: string;
    processId?: number | null;
    gameId?: string | null;
    titleId?: string | null;
    titleName?: string | null;
    sessionDurationSeconds?: number | null;
    startedAt?: string | null;
    endedAt?: string | null;
}

export interface RunningTrainerStatus {
    state: 'idle' | 'running';
    event: string;
    trainerId?: string | null;
    displayName?: string | null;
    gameId?: string | null;
    titleId?: string | null;
}

export interface GameStatusPayload {
    instanceId: string;
    updatedAt: string;
    session: GameSessionStatus;
    trainer: RunningTrainerStatus;
}

export interface TrainerSummary {
    trainerId: string;
    gameId: string;
    displayName?: string | null;
    titleId?: string | null;
    gameVersion?: string | null;
    trainerLoading: boolean;
    gameInstalled: boolean;
    needsCompatibilityWarning: boolean;
    language?: string;
    themeId?: string;
    isTimeLimitExpired: boolean;
    notesReadHash?: string | null;
}

export interface TrainerMetaPayload {
    session: {
        instanceId: string;
    };
    trainer: TrainerSummary;
    schema: {
        categories: string[];
        cheats: CheatSchema[];
    };
}

export type TrainerValuesPayload = {
    trainerId: string;
    values: Record<string, unknown>;
};

export type ValueChangedPayload = {
    trainerId: string;
    target: string;
    value: unknown;
    oldValue?: unknown;
    source?: string;
    cheatId?: string;
};

export type TrainerChangedPayload = {
    previousTrainerId?: string | null;
    trainerId: string;
};

export type InstalledAppsMessage = MessageEnvelope<'installed_apps', InstalledAppsPayload>;
export type GameStatusMessage = MessageEnvelope<'game_status', GameStatusPayload>;

export type RemoteCommandAction = 'launch' | 'stop';

export type SetValuePayload = {
    trainerId: string;
    target: string;
    value: unknown;
    cheatId?: string;
};

export type RemoteCommandPayload = {
    action: RemoteCommandAction;
    gameId?: string | null;
    titleId?: string | null;
};

export type SetValueResultPayload = {
    ok: boolean;
    trainerId: string;
    target: string;
    error?: {
        code: string;
        message: string;
    };
};

export type RemoteCommandResultPayload = {
    ok: boolean;
    action: RemoteCommandAction;
    gameId?: string | null;
    titleId?: string | null;
    error?: {
        code: string;
        message: string;
    };
};

export type OscStatePayload = {
    config: OscBotConfig;
    status: OscBotStatus;
    /** Most recent activity, oldest first; later entries arrive through `osc_activity`. */
    activity: OscActivityEntry[];
};

export type OscStatusPayload = {
    status: OscBotStatus;
};

export type OscActivityPayload = {
    entries: OscActivityEntry[];
};

export type OscConfigPayload = {
    config: OscBotConfig;
};

export type OscCommandAction = 'send' | 'chatbox_send' | 'chatbox_clear' | 'reset_stats';

export type OscCommandPayload =
    | { action: 'send'; address: string; args: OscArgPreview[]; targetId?: string | null }
    | { action: 'chatbox_send'; text: string }
    | { action: 'chatbox_clear' }
    | { action: 'reset_stats' };

export type OscCommandResultPayload = {
    ok: boolean;
    action: OscCommandAction;
    error?: {
        code: string;
        message: string;
    };
};

export type ErrorPayload = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
};

export interface MessageEnvelope<TType extends string, TPayload> {
    type: TType;
    version: number;
    requestId: string | null;
    payload: TPayload;
}

export type HelloMessage = MessageEnvelope<
    'hello',
    {
        client: 'mobile-web';
        clientVersion: string;
        capabilities: {
            supportsDeltaValues: boolean;
            supportsTrainerSwitch: boolean;
        };
    }
>;

export type HelloAckMessage = MessageEnvelope<
    'hello_ack',
    {
        sessionId: string;
        accepted: boolean;
        serverVersion: string;
        protocolVersion: number;
        remoteUrl?: string;
        advertisedUrls?: string[];
    }
>;

export type TrainerMetaMessage = MessageEnvelope<'trainer_meta', TrainerMetaPayload>;
export type TrainerValuesMessage = MessageEnvelope<'trainer_values', TrainerValuesPayload>;
export type ValueChangedMessage = MessageEnvelope<'value_changed', ValueChangedPayload>;
export type TrainerChangedMessage = MessageEnvelope<'trainer_changed', TrainerChangedPayload>;
export type SetValueMessage = MessageEnvelope<'set_value', SetValuePayload>;
export type SetValueResultMessage = MessageEnvelope<'set_value_result', SetValueResultPayload>;
export type RemoteCommandMessage = MessageEnvelope<'remote_command', RemoteCommandPayload>;
export type RemoteCommandResultMessage = MessageEnvelope<
    'remote_command_result',
    RemoteCommandResultPayload
>;
export type ErrorMessage = MessageEnvelope<'error', ErrorPayload>;
export type OscStateMessage = MessageEnvelope<'osc_state', OscStatePayload>;
export type OscStatusMessage = MessageEnvelope<'osc_status', OscStatusPayload>;
export type OscActivityMessage = MessageEnvelope<'osc_activity', OscActivityPayload>;
export type OscCommandResultMessage = MessageEnvelope<
    'osc_command_result',
    OscCommandResultPayload
>;
export type OscConfigMessage = MessageEnvelope<'osc_config', OscConfigPayload>;
export type OscCommandMessage = MessageEnvelope<'osc_command', OscCommandPayload>;

export type IncomingMessage =
    | HelloAckMessage
    | TrainerMetaMessage
    | TrainerValuesMessage
    | GameStatusMessage
    | InstalledAppsMessage
    | ValueChangedMessage
    | TrainerChangedMessage
    | SetValueResultMessage
    | RemoteCommandResultMessage
    | OscStateMessage
    | OscStatusMessage
    | OscActivityMessage
    | OscCommandResultMessage
    | ErrorMessage;

export type OutgoingMessage =
    | HelloMessage
    | SetValueMessage
    | RemoteCommandMessage
    | OscConfigMessage
    | OscCommandMessage;
