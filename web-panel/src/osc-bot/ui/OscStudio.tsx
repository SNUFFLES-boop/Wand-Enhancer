import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';
import { EOscBotState, type OscActivityEntry } from '../../../protocol/osc';
import {
    EStudioSection,
    loadStudioLayout,
    moveSection,
    type StudioLayout,
    saveStudioLayout,
    toggleSectionFlag,
} from '../model/studio-layout';
import { type OscStudioSession, useOscStudio } from '../model/use-osc-studio';
import { AddressBookSection } from './AddressBookSection';
import { BindingsSection } from './BindingsSection';
import { ChatboxSection } from './ChatboxSection';
import { SECTION_LABELS } from './labels';
import { MonitorSection } from './MonitorSection';
import { NetworkSection } from './NetworkSection';
import { OscHero } from './OscHero';
import { StudioSection } from './StudioSection';

const NOTICE_MS = 2600;

/** The OSC bot capability: chatbox bot, bindings, network, address map and monitor. */
export default function OscStudio({ session }: { session: OscStudioSession }) {
    const { _ } = useLingui();
    const studio = useOscStudio(session);
    const [layout, setLayout] = useState<StudioLayout>(loadStudioLayout);
    const [customizing, setCustomizing] = useState(false);
    const [expandedBindingId, setExpandedBindingId] = useState<string | null>(null);

    const changeLayout = (next: StudioLayout) => {
        setLayout(next);
        saveStudioLayout(next);
    };

    if (!studio.ready || !studio.config || !studio.status) {
        return <StudioPlaceholder connected={studio.connected} />;
    }

    const { config, status } = studio;
    const running = status.state !== EOscBotState.Disabled;
    const sections = layout.order.filter(
        (section) => customizing || !layout.hidden.includes(section),
    );

    const bindFromMonitor = (entry: OscActivityEntry) => {
        const id = studio.bindings.bindFrom(entry);
        if (layout.collapsed.includes(EStudioSection.Bindings)) {
            changeLayout(toggleSectionFlag(layout, 'collapsed', EStudioSection.Bindings));
        }
        setExpandedBindingId(id);
    };

    const content: Record<EStudioSection, { badge?: ReactNode; body: ReactNode }> = {
        [EStudioSection.Chatbox]: {
            badge: <Badge on={config.chatbox.enabled && running} />,
            body: (
                <ChatboxSection
                    config={config}
                    status={status}
                    cheats={studio.cheats}
                    chatbox={studio.chatbox}
                />
            ),
        },
        [EStudioSection.Bindings]: {
            badge: config.bindings.length ? (
                <CountBadge value={config.bindings.length} />
            ) : undefined,
            body: (
                <BindingsSection
                    bindings={config.bindings}
                    cheats={studio.cheats}
                    activity={studio.activity}
                    currentGameId={studio.currentGameId}
                    launchableGames={studio.launchableGames}
                    model={studio.bindings}
                    expandedId={expandedBindingId}
                    onExpand={setExpandedBindingId}
                />
            ),
        },
        [EStudioSection.Network]: {
            badge: <CountBadge value={config.targets.filter((target) => target.enabled).length} />,
            body: (
                <NetworkSection config={config} network={studio.network} backup={studio.backup} />
            ),
        },
        [EStudioSection.Addresses]: {
            body: (
                <AddressBookSection
                    prefix={config.prefix}
                    autoMap={config.autoMap}
                    cheats={studio.cheats}
                />
            ),
        },
        [EStudioSection.Monitor]: {
            badge: running ? <LiveDot /> : undefined,
            body: (
                <MonitorSection
                    activity={studio.activity}
                    targets={config.targets}
                    running={running}
                    monitor={studio.monitor}
                    onBind={bindFromMonitor}
                />
            ),
        },
    };

    return (
        <div className="pb-4 pt-1">
            <OscHero
                config={config}
                status={status}
                customizing={customizing}
                onToggleEnabled={studio.bot.setEnabled}
                onApplyPreset={studio.bot.applyPreset}
                onToggleCustomizing={() => setCustomizing((value) => !value)}
                onResetStats={studio.monitor.resetStats}
            />
            {customizing ? (
                <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-dashed border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] px-3 py-2 text-[12px] text-(--deck-fg-2) motion-safe:animate-[osc-rise_200ms_ease-out]">
                    <Icon className="size-4 shrink-0 text-(--deck-accent)" name="layout" />
                    <span className="min-w-0 flex-1">
                        <Trans>
                            Reorder sections and hide the ones you do not use. Saved on this device.
                        </Trans>
                    </span>
                    <button
                        type="button"
                        className="shrink-0 rounded-[8px] bg-(--deck-accent) px-2.5 py-1 text-[11.5px] font-bold text-black"
                        onClick={() => setCustomizing(false)}
                    >
                        <Trans>Done</Trans>
                    </button>
                </div>
            ) : null}
            <div className="osc-studio-columns">
                {sections.map((section, index) => {
                    const meta = SECTION_LABELS[section];
                    return (
                        <StudioSection
                            key={section}
                            id={section}
                            title={_(meta.label)}
                            subtitle={_(meta.hint)}
                            icon={meta.icon}
                            badge={content[section].badge}
                            collapsed={layout.collapsed.includes(section)}
                            hidden={layout.hidden.includes(section)}
                            customizing={customizing}
                            canMoveUp={index > 0}
                            canMoveDown={index < sections.length - 1}
                            onToggleCollapsed={() =>
                                changeLayout(toggleSectionFlag(layout, 'collapsed', section))
                            }
                            onMove={(direction) =>
                                changeLayout(moveSection(layout, section, direction))
                            }
                            onToggleHidden={() =>
                                changeLayout(toggleSectionFlag(layout, 'hidden', section))
                            }
                        >
                            {content[section].body}
                        </StudioSection>
                    );
                })}
            </div>
            <NoticeToast notice={studio.notice} />
        </div>
    );
}

const StudioPlaceholder = ({ connected }: { connected: boolean }) => {
    return (
        <div className="flex min-h-[60svh] flex-col items-center justify-center px-8 text-center">
            <span className="relative flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/4 text-(--deck-fg-3)">
                {connected ? (
                    <span className="osc-orb-ring absolute -inset-1 rounded-full" />
                ) : null}
                <Icon className="size-7" name="broadcast" stroke={1.6} />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold text-(--deck-fg)">
                {connected ? <Trans>Loading the OSC bot…</Trans> : <Trans>Bridge offline</Trans>}
            </h2>
            <p className="mt-1 max-w-72 text-[12.5px] leading-relaxed text-(--deck-fg-3)">
                {connected ? (
                    <Trans>
                        This Wand build may be patched with an older Enhancer. Re-patch to get the
                        OSC bot.
                    </Trans>
                ) : (
                    <Trans>Connect to Wand from Settings to configure the OSC bot.</Trans>
                )}
            </p>
        </div>
    );
};

const Badge = ({ on }: { on: boolean }) => {
    return (
        <span
            className={cn(
                'shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.1em]',
                on
                    ? 'bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent)'
                    : 'bg-white/6 text-(--deck-fg-4)',
            )}
        >
            {on ? 'ON' : 'OFF'}
        </span>
    );
};

const CountBadge = ({ value }: { value: number }) => {
    return (
        <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-white/8 px-1.5 font-mono text-[10px] font-bold tabular-nums text-(--deck-fg-2)">
            {value}
        </span>
    );
};

const LiveDot = () => {
    return (
        <span className="size-1.5 shrink-0 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)] motion-safe:animate-[breathe_1.6s_ease-in-out_infinite]" />
    );
};

const NoticeToast = ({ notice }: { notice: ReturnType<typeof useOscStudio>['notice'] }) => {
    const { _ } = useLingui();
    const [visibleId, setVisibleId] = useState<number | null>(null);
    // A notice from before this studio mounted is old news.
    const mountedNoticeId = useRef(notice?.id ?? 0);

    useEffect(() => {
        if (!notice || notice.id === mountedNoticeId.current) return;
        setVisibleId(notice.id);
        const timer = window.setTimeout(() => setVisibleId(null), NOTICE_MS);
        return () => window.clearTimeout(timer);
    }, [notice]);

    if (!notice || visibleId !== notice.id) return null;
    const text = notice.ok
        ? notice.action === 'chatbox_clear'
            ? _(msg`Chatbox cleared`)
            : notice.action === 'reset_stats'
              ? _(msg`Counters reset`)
              : _(msg`Sent`)
        : (notice.message ?? _(msg`The bot could not do that`));

    return (
        <div
            role="status"
            className={cn(
                'pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto flex w-fit max-w-[88%] items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold shadow-[0_12px_32px_rgba(0,0,0,.45)] motion-safe:animate-[osc-rise_200ms_ease-out]',
                notice.ok
                    ? 'border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] bg-[#0e1016]/95 text-(--deck-fg)'
                    : 'border-red-400/40 bg-[#1a0e10]/95 text-red-100',
            )}
        >
            <Icon
                className={cn('size-3.5', notice.ok ? 'text-(--deck-accent)' : 'text-red-300')}
                name={notice.ok ? 'check' : 'alert'}
                stroke={2.2}
            />
            {text}
        </div>
    );
};
