import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { useNow } from '@/shared/lib/use-now';
import {
    type ChatboxContext,
    chatboxLength,
    renderChatboxTemplate,
} from '../../../protocol/chatbox-template';
import { OSC_LIMITS, type OscChatboxConfig } from '../../../protocol/osc';

type ChatboxPreviewProps = {
    chatbox: OscChatboxConfig;
    lastSent: string | null;
    lastSentAt: string | null;
    contextAt: (now: Date) => ChatboxContext;
};

const TYPING_PREVIEW_MS = 700;

/** Plays the rotation exactly as VRChat will show it, with live tokens and timing. */
export const ChatboxPreview = ({
    chatbox,
    lastSent,
    lastSentAt,
    contextAt,
}: ChatboxPreviewProps) => {
    const { _ } = useLingui();
    const now = useNow(1000);
    const [tick, setTick] = useState(0);
    const [typing, setTyping] = useState(false);
    const context = contextAt(now);
    const rendered = chatbox.messages
        .map((template) => renderChatboxTemplate(template, context))
        .filter((text) => text.trim());
    const idle = context.active ? null : renderChatboxTemplate(chatbox.idleMessage, context);
    const text = context.active
        ? (rendered[tick % Math.max(1, rendered.length)] ?? '')
        : (idle ?? '');
    const length = chatboxLength(text);
    const position = rendered.length > 0 ? (tick % rendered.length) + 1 : 0;

    useEffect(() => {
        if (!chatbox.enabled) return;
        const timer = window.setInterval(() => {
            setTick((value) => value + 1);
        }, chatbox.intervalSeconds * 1000);
        return () => window.clearInterval(timer);
    }, [chatbox.enabled, chatbox.intervalSeconds]);

    useEffect(() => {
        if (!chatbox.typingIndicator || !chatbox.enabled || tick === 0) return;
        setTyping(true);
        const timer = window.setTimeout(() => setTyping(false), TYPING_PREVIEW_MS);
        return () => window.clearTimeout(timer);
    }, [chatbox.enabled, chatbox.typingIndicator, tick]);

    const sentAgo = lastSentAt
        ? Math.max(0, Math.round((now.getTime() - Date.parse(lastSentAt)) / 1000))
        : null;

    return (
        <div className="overflow-hidden rounded-[14px] border border-white/10">
            <div className="relative flex min-h-36 flex-col items-center justify-end bg-[radial-gradient(ellipse_at_50%_120%,rgba(120,90,255,.35),transparent_60%),linear-gradient(180deg,#151a2e,#0b0d16)] px-4 pb-4 pt-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.08)_0_1px,transparent_1.5px),radial-gradient(circle_at_70%_35%,rgba(255,255,255,.06)_0_1px,transparent_1.5px),radial-gradient(circle_at_45%_12%,rgba(255,255,255,.07)_0_1px,transparent_1.5px)]" />
                <div
                    key={`${tick}-${text}`}
                    className={cn(
                        'relative max-w-[92%] rounded-[14px] border border-white/15 bg-[rgba(18,20,28,.86)] px-3.5 py-2.5 text-center text-[13px] leading-snug text-white shadow-[0_12px_32px_rgba(0,0,0,.45)] motion-safe:animate-[osc-rise_280ms_ease-out]',
                        !chatbox.enabled && 'opacity-50 grayscale',
                    )}
                >
                    {typing ? (
                        <span className="flex h-4.5 items-center justify-center gap-1">
                            <span className="sr-only">{_(msg`Typing`)}</span>
                            {[0, 1, 2].map((dot) => (
                                <span
                                    key={dot}
                                    className="size-1.5 rounded-full bg-white motion-safe:animate-[osc-typing_900ms_ease-in-out_infinite]"
                                    style={{ animationDelay: `${dot * 120}ms` }}
                                />
                            ))}
                        </span>
                    ) : text ? (
                        <span className="whitespace-pre-wrap break-words">{text}</span>
                    ) : (
                        <span className="text-white/45">
                            <Trans>Chatbox stays empty</Trans>
                        </span>
                    )}
                    <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-white/15 bg-[rgba(18,20,28,.86)]" />
                </div>
                <div className="relative mt-3 rounded-full bg-black/45 px-2.5 py-0.5 text-[10.5px] font-semibold text-white/80">
                    <Trans>You</Trans>
                </div>
                <CharacterRing length={length} />
            </div>
            {chatbox.enabled && context.active && rendered.length > 0 ? (
                <div className="h-0.5 bg-white/5">
                    <div
                        key={tick}
                        className="h-full origin-left bg-(--deck-accent) motion-safe:animate-[osc-progress_linear_both]"
                        style={{ animationDuration: `${chatbox.intervalSeconds}s` }}
                    />
                </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 bg-black/25 px-3 py-2 font-mono text-[10.5px] text-(--deck-fg-4)">
                <span>
                    {context.active
                        ? _(
                              msg`Message ${position} of ${rendered.length} · every ${chatbox.intervalSeconds}s`,
                          )
                        : _(msg`Idle message`)}
                </span>
                <span className="truncate text-right">
                    {lastSent !== null && sentAgo !== null
                        ? lastSent
                            ? _(msg`Sent ${sentAgo}s ago`)
                            : _(msg`Cleared ${sentAgo}s ago`)
                        : _(msg`Nothing sent yet`)}
                </span>
            </div>
        </div>
    );
};

const RING_RADIUS = 9;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const CharacterRing = ({ length }: { length: number }) => {
    const { _ } = useLingui();
    const ratio = Math.min(1, length / OSC_LIMITS.chatboxMaxChars);
    const full = length >= OSC_LIMITS.chatboxMaxChars;

    return (
        <div
            className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/40 py-0.5 pl-1 pr-2"
            title={_(msg`${length} of ${OSC_LIMITS.chatboxMaxChars} characters`)}
        >
            <svg aria-hidden="true" className="size-5 -rotate-90" viewBox="0 0 24 24">
                <circle
                    cx="12"
                    cy="12"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,.12)"
                    strokeWidth="3"
                />
                <circle
                    cx="12"
                    cy="12"
                    r={RING_RADIUS}
                    fill="none"
                    stroke={full ? '#fca5a5' : 'var(--deck-accent)'}
                    strokeDasharray={RING_LENGTH}
                    strokeDashoffset={RING_LENGTH * (1 - ratio)}
                    strokeLinecap="round"
                    strokeWidth="3"
                    className="transition-[stroke-dashoffset] duration-500"
                />
            </svg>
            <span
                className={cn(
                    'font-mono text-[10px] font-bold tabular-nums',
                    full ? 'text-red-300' : 'text-white/80',
                )}
            >
                {length}/{OSC_LIMITS.chatboxMaxChars}
            </span>
        </div>
    );
};
