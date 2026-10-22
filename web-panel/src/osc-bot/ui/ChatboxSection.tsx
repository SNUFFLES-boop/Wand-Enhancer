import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { type FormEvent, useRef, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Switch } from '@/shared/ui/Switch';
import {
    CHATBOX_TOKENS,
    chatboxLength,
    renderChatboxTemplate,
} from '../../../protocol/chatbox-template';
import type { CheatSchema } from '../../../protocol/messages';
import { OSC_LIMITS, type OscBotConfig, type OscBotStatus } from '../../../protocol/osc';
import type { OscStudioModel } from '../model/use-osc-studio';
import { ChatboxPreview } from './ChatboxPreview';
import { TOKEN_LABELS } from './labels';
import { Eyebrow, RangeField, SettingRow } from './StudioSection';

type ChatboxSectionProps = {
    config: OscBotConfig;
    status: OscBotStatus;
    cheats: CheatSchema[];
    chatbox: OscStudioModel['chatbox'];
};

type FieldKey =
    | { kind: 'message'; index: number }
    | { kind: 'idle' }
    | { kind: 'announce' }
    | { kind: 'quick' };

const TEXTAREA_CLASS = cn(
    INPUT_CLASS,
    'h-auto min-h-16 resize-none py-2 font-mono text-[12.5px] leading-relaxed',
);

export const ChatboxSection = ({ config, status, cheats, chatbox }: ChatboxSectionProps) => {
    const { _ } = useLingui();
    const settings = config.chatbox;
    const [quickText, setQuickText] = useState('');
    const focusedRef = useRef<{
        key: FieldKey;
        element: HTMLTextAreaElement | HTMLInputElement;
    } | null>(null);
    const context = chatbox.contextAt(new Date());
    const chatboxOutputs = config.targets.filter(
        (target) => target.enabled && target.chatbox,
    ).length;

    const remember =
        (key: FieldKey) => (event: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => {
            focusedRef.current = { key, element: event.currentTarget };
        };

    const writeField = (key: FieldKey, value: string) => {
        if (key.kind === 'message') chatbox.setMessage(key.index, value);
        else if (key.kind === 'idle') chatbox.update({ idleMessage: value });
        else if (key.kind === 'announce') chatbox.update({ announceTemplate: value });
        else setQuickText(value);
    };

    // Tokens land at the caret of whichever field was focused last (the first message by default).
    const insertToken = (token: string) => {
        const focused = focusedRef.current;
        if (!focused) {
            if (settings.messages.length === 0) chatbox.addMessage(token);
            else chatbox.setMessage(0, `${settings.messages[0]}${token}`);
            return;
        }
        const { element, key } = focused;
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? start;
        const next = `${element.value.slice(0, start)}${token}${element.value.slice(end)}`;
        writeField(key, next);
        requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const sendQuick = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (quickText.trim() && chatbox.sendNow(quickText)) setQuickText('');
    };

    return (
        <div className="space-y-3.5">
            <SettingRow
                title={_(msg`Chatbox bot`)}
                description={
                    chatboxOutputs > 0
                        ? _(msg`Rotates your messages to ${chatboxOutputs} output(s).`)
                        : _(msg`No output has Chatbox enabled yet. Add VRChat under Network.`)
                }
            >
                <Switch
                    checked={settings.enabled}
                    label={_(msg`Chatbox bot`)}
                    onChange={(enabled) => chatbox.update({ enabled }, true)}
                />
            </SettingRow>

            <ChatboxPreview
                chatbox={settings}
                lastSent={status.lastChatbox}
                lastSentAt={status.lastChatboxAt}
                contextAt={chatbox.contextAt}
            />

            <div>
                <Eyebrow>
                    <Trans>Rotation</Trans>
                </Eyebrow>
                <div className="space-y-2">
                    {settings.messages.map((template, index) => {
                        const rendered = renderChatboxTemplate(template, context);
                        const length = chatboxLength(rendered);
                        return (
                            <div
                                key={index}
                                className="rounded-[12px] border border-white/8 bg-black/15 p-2 motion-safe:animate-[osc-rise_220ms_ease-out]"
                            >
                                <div className="mb-1.5 flex items-center gap-1.5">
                                    <span className="flex size-5 items-center justify-center rounded-[6px] bg-white/6 font-mono text-[10px] font-bold text-(--deck-fg-3)">
                                        {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[11px] text-(--deck-fg-3)">
                                        {rendered.trim()
                                            ? rendered.replace(/\n/g, ' ⏎ ')
                                            : _(msg`Renders empty now · skipped`)}
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono text-[10px] tabular-nums',
                                            length >= OSC_LIMITS.chatboxMaxChars
                                                ? 'text-red-300'
                                                : 'text-(--deck-fg-4)',
                                        )}
                                    >
                                        {length}
                                    </span>
                                    <IconButton
                                        size="sm"
                                        icon="arrow-up"
                                        label={_(msg`Move message ${index + 1} up`)}
                                        disabled={index === 0}
                                        className="border-transparent bg-transparent"
                                        onClick={() => chatbox.moveMessage(index, -1)}
                                    />
                                    <IconButton
                                        size="sm"
                                        icon="arrow-down"
                                        label={_(msg`Move message ${index + 1} down`)}
                                        disabled={index === settings.messages.length - 1}
                                        className="border-transparent bg-transparent"
                                        onClick={() => chatbox.moveMessage(index, 1)}
                                    />
                                    <IconButton
                                        size="sm"
                                        icon="trash"
                                        label={_(msg`Delete message ${index + 1}`)}
                                        className="border-transparent bg-transparent"
                                        onClick={() => chatbox.removeMessage(index)}
                                    />
                                </div>
                                <textarea
                                    value={template}
                                    rows={2}
                                    maxLength={OSC_LIMITS.maxTemplateLength}
                                    spellCheck={false}
                                    aria-label={_(msg`Message ${index + 1}`)}
                                    className={TEXTAREA_CLASS}
                                    onFocus={remember({ kind: 'message', index })}
                                    onSelect={remember({ kind: 'message', index })}
                                    onInput={(event) =>
                                        chatbox.setMessage(index, event.currentTarget.value)
                                    }
                                />
                            </div>
                        );
                    })}
                    {settings.messages.length < OSC_LIMITS.maxMessages ? (
                        <button
                            type="button"
                            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/15 text-[12px] font-semibold text-(--deck-fg-3) hover:border-[color-mix(in_oklab,var(--deck-accent)_50%,transparent)] hover:text-(--deck-accent)"
                            onClick={() => chatbox.addMessage()}
                        >
                            <Icon className="size-3.5" name="plus" stroke={2} />
                            <Trans>Add message</Trans>
                        </button>
                    ) : null}
                </div>
            </div>

            <TokenPalette cheats={cheats} onInsert={insertToken} />

            <div>
                <Eyebrow>
                    <Trans>While idle</Trans>
                </Eyebrow>
                <textarea
                    value={settings.idleMessage}
                    rows={1}
                    spellCheck={false}
                    placeholder={_(msg`Empty clears the chatbox when no game runs`)}
                    aria-label={_(msg`Idle message`)}
                    className={cn(TEXTAREA_CLASS, 'min-h-10')}
                    onFocus={remember({ kind: 'idle' })}
                    onSelect={remember({ kind: 'idle' })}
                    onInput={(event) => chatbox.update({ idleMessage: event.currentTarget.value })}
                />
            </div>

            <div className="rounded-[12px] border border-white/8 bg-black/15 px-3">
                <SettingRow
                    title={_(msg`Announce mod changes`)}
                    description={_(msg`Pops a message whenever a mod changes, from any source.`)}
                >
                    <Switch
                        checked={settings.announceChanges}
                        label={_(msg`Announce mod changes`)}
                        onChange={(announceChanges) => chatbox.update({ announceChanges }, true)}
                    />
                </SettingRow>
                {settings.announceChanges ? (
                    <div className="pb-3">
                        <input
                            value={settings.announceTemplate}
                            spellCheck={false}
                            aria-label={_(msg`Announcement template`)}
                            className={cn(INPUT_CLASS, 'font-mono text-[12.5px]')}
                            onFocus={remember({ kind: 'announce' })}
                            onSelect={remember({ kind: 'announce' })}
                            onInput={(event) =>
                                chatbox.update({ announceTemplate: event.currentTarget.value })
                            }
                        />
                    </div>
                ) : null}
                <div className="border-t border-white/6">
                    <RangeField
                        label={_(msg`Rotate every`)}
                        value={settings.intervalSeconds}
                        min={OSC_LIMITS.minIntervalSeconds}
                        max={30}
                        format={(value) => `${value}s`}
                        onChange={(intervalSeconds) => chatbox.update({ intervalSeconds })}
                    />
                </div>
                <div className="border-t border-white/6">
                    <SettingRow
                        title={_(msg`Notification sound`)}
                        description={_(msg`Plays VRChat's chime for announcements.`)}
                    >
                        <Switch
                            checked={settings.notifySound}
                            label={_(msg`Notification sound`)}
                            onChange={(notifySound) => chatbox.update({ notifySound }, true)}
                        />
                    </SettingRow>
                    <SettingRow
                        title={_(msg`Typing indicator`)}
                        description={_(msg`Shows the typing bubble before each message.`)}
                    >
                        <Switch
                            checked={settings.typingIndicator}
                            label={_(msg`Typing indicator`)}
                            onChange={(typingIndicator) =>
                                chatbox.update({ typingIndicator }, true)
                            }
                        />
                    </SettingRow>
                </div>
            </div>

            <form className="flex gap-1.5" onSubmit={sendQuick}>
                <input
                    value={quickText}
                    spellCheck={false}
                    placeholder={_(msg`Say something in the chatbox…`)}
                    aria-label={_(msg`One-off chatbox message`)}
                    maxLength={OSC_LIMITS.maxTemplateLength}
                    className={INPUT_CLASS}
                    onFocus={remember({ kind: 'quick' })}
                    onSelect={remember({ kind: 'quick' })}
                    onInput={(event) => setQuickText(event.currentTarget.value)}
                />
                <button
                    type="submit"
                    aria-label={_(msg`Send to chatbox`)}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-(--deck-accent) px-3.5 text-[12px] font-bold text-black shadow-[0_8px_24px_-10px_var(--deck-accent)] active:scale-[0.97]"
                >
                    <Icon className="size-3.5" name="send" stroke={2.2} />
                    <Trans>Send</Trans>
                </button>
                <IconButton
                    size="lg"
                    icon="x"
                    label={_(msg`Clear chatbox`)}
                    onClick={chatbox.clear}
                />
            </form>
        </div>
    );
};

const TokenPalette = ({
    cheats,
    onInsert,
}: {
    cheats: CheatSchema[];
    onInsert: (token: string) => void;
}) => {
    const { _ } = useLingui();
    const valueCheats = cheats.filter((cheat) => cheat.type !== 'button');

    return (
        <div>
            <Eyebrow>
                <Trans>Insert token</Trans>
            </Eyebrow>
            <div className="flex flex-wrap gap-1.5">
                {CHATBOX_TOKENS.map((token) => (
                    <button
                        key={token}
                        type="button"
                        title={`{${token}}`}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-(--deck-fg-2) transition-colors hover:border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] hover:text-(--deck-accent) active:scale-95"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onInsert(`{${token}}`)}
                    >
                        {_(TOKEN_LABELS[token])}
                    </button>
                ))}
                {valueCheats.length > 0 ? (
                    <select
                        aria-label={_(msg`Insert a mod value`)}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-(--deck-fg-2) outline-none"
                        value=""
                        onMouseDown={(event) => event.stopPropagation()}
                        onChange={(event) => {
                            if (event.currentTarget.value)
                                onInsert(`{value:${event.currentTarget.value}}`);
                        }}
                    >
                        <option value="">{_(msg`Mod value…`)}</option>
                        {valueCheats.map((cheat) => (
                            <option key={cheat.uuid} value={cheat.target}>
                                {cheat.name}
                            </option>
                        ))}
                    </select>
                ) : null}
            </div>
        </div>
    );
};
