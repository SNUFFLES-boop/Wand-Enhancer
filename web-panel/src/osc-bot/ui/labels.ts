import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { IconName } from '@/shared/ui/Icon';
import type { ChatboxToken } from '../../../protocol/chatbox-template';
import { EOscAction, EOscBotState } from '../../../protocol/osc';
import { EStudioSection } from '../model/studio-layout';

type Described = { label: MessageDescriptor; hint: MessageDescriptor; icon: IconName };

export const ACTION_LABELS: Record<EOscAction, Described> = {
    [EOscAction.Toggle]: {
        label: msg`Toggle`,
        hint: msg`Flips a toggle mod on every press. Releases are ignored.`,
        icon: 'refresh',
    },
    [EOscAction.Hold]: {
        label: msg`Hold`,
        hint: msg`The mod stays on while the input is on. Ideal for avatar bools.`,
        icon: 'pin',
    },
    [EOscAction.Set]: {
        label: msg`Set`,
        hint: msg`Writes the incoming value. Rescale maps a 0–1 fader onto the mod's range.`,
        icon: 'sliders',
    },
    [EOscAction.Press]: {
        label: msg`Press`,
        hint: msg`Fires a one-shot mod such as Heal or Add money.`,
        icon: 'bolt',
    },
    [EOscAction.Fixed]: {
        label: msg`Fixed`,
        hint: msg`Writes the value you choose here on every press.`,
        icon: 'check',
    },
    [EOscAction.Step]: {
        label: msg`Step`,
        hint: msg`Adds the amount on every press. Use a negative amount to step down.`,
        icon: 'plus',
    },
    [EOscAction.Panic]: {
        label: msg`Panic`,
        hint: msg`Turns every toggle mod off at once.`,
        icon: 'alert',
    },
    [EOscAction.Chatbox]: {
        label: msg`Chatbox`,
        hint: msg`Sends your message to the chatbox. Tokens are filled in live.`,
        icon: 'message',
    },
    [EOscAction.Launch]: {
        label: msg`Launch`,
        hint: msg`Starts the trainer for the game you pick.`,
        icon: 'play',
    },
    [EOscAction.Stop]: {
        label: msg`Stop`,
        hint: msg`Ends the running trainer.`,
        icon: 'stop',
    },
};

export const SECTION_LABELS: Record<EStudioSection, Described> = {
    [EStudioSection.Chatbox]: {
        label: msg`VRChat Chatbox`,
        hint: msg`Live status above your avatar`,
        icon: 'message',
    },
    [EStudioSection.Bindings]: {
        label: msg`Bindings`,
        hint: msg`Controllers and avatar parameters → mods`,
        icon: 'link',
    },
    [EStudioSection.Network]: {
        label: msg`Network`,
        hint: msg`Listener, outputs and backups`,
        icon: 'network',
    },
    [EStudioSection.Addresses]: {
        label: msg`Address Map`,
        hint: msg`Zero-config addresses for every mod`,
        icon: 'list',
    },
    [EStudioSection.Monitor]: {
        label: msg`Live Monitor`,
        hint: msg`Every packet in and out`,
        icon: 'activity',
    },
};

export const STATE_LABELS: Record<EOscBotState, MessageDescriptor> = {
    [EOscBotState.Disabled]: msg`Bot is off`,
    [EOscBotState.Starting]: msg`Starting…`,
    [EOscBotState.Listening]: msg`Listening`,
    [EOscBotState.SendOnly]: msg`Send only`,
    [EOscBotState.Error]: msg`Error`,
};

export const TOKEN_LABELS: Record<ChatboxToken, MessageDescriptor> = {
    game: msg`Game`,
    version: msg`Version`,
    mods_on: msg`Mods on`,
    mods_total: msg`Mods total`,
    mods_list: msg`Active mods`,
    mods_bar: msg`Mods bar`,
    last_mod: msg`Last mod`,
    last_value: msg`Last value`,
    session: msg`Session time`,
    time: msg`Clock`,
    time12: msg`Clock 12h`,
    date: msg`Date`,
    uptime: msg`Bot uptime`,
};
