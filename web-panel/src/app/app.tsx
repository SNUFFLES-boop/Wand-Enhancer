import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { lazy, Suspense } from 'react';

import { FloatingDock } from '@/app/ui/FloatingDock';
import { PlaceholderState } from '@/app/ui/PlaceholderState';
import { SessionPlaceholder } from '@/app/ui/SessionPlaceholder';
import { SettingsDrawer } from '@/app/ui/SettingsDrawer';
import { TopBar } from '@/app/ui/TopBar';
import { LibraryDrawer } from '@/library/ui/LibraryDrawer';
import { Drawer } from '@/shared/ui/Drawer';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { SearchInput } from '@/shared/ui/SearchInput';
import { CategorySection } from '@/trainer/ui/CategorySection';
import { QuickActions } from '@/trainer/ui/QuickActions';
import { TrainerHeader } from '@/trainer/ui/TrainerHeader';

import { EPanelView, useRemotePanel } from './use-remote-panel';

// The studio is only fetched when opened, so phones that never use OSC never download it.
const OscStudio = lazy(() => import('@/osc-bot/ui/OscStudio'));

export const App = () => {
    const { _ } = useLingui();
    const panel = useRemotePanel();
    const { session, trainer, library, osc, shell } = panel;

    return (
        <main className="min-h-svh bg-(--deck-shell) text-(--deck-fg)">
            <div className="flex min-h-svh w-full p-0">
                <section className="relative h-svh w-full overflow-hidden bg-(--deck-bg) shadow-[0_40px_100px_-20px_rgba(0,0,0,.7),0_0_0_1px_rgba(255,255,255,.06)]">
                    <div className="deck-glow pointer-events-none absolute -inset-12 z-0 bg-[radial-gradient(circle_at_30%_15%,color-mix(in_oklab,var(--deck-accent)_22%,transparent),transparent_45%),radial-gradient(circle_at_80%_85%,color-mix(in_oklab,var(--deck-accent)_16%,transparent),transparent_45%),radial-gradient(circle_at_20%_80%,color-mix(in_oklab,var(--deck-accent)_8%,transparent),transparent_50%)]" />
                    <div className="deck-theme-tint pointer-events-none absolute inset-0 z-0" />
                    <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(255,255,255,0.025),transparent)]" />
                    <div className="relative z-10 flex h-full flex-col">
                        <TopBar
                            status={session.status}
                            view={shell.view}
                            currentGame={library.currentGame}
                            runningTrainer={trainer.activeTrainer}
                            onOpenSettings={shell.openSettings}
                        />
                        <div
                            data-scroll-root
                            className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-27.5"
                            onScroll={shell.onScroll}
                        >
                            <div className="deck-scale deck-content mx-auto w-full">
                                {shell.view === EPanelView.Osc ? (
                                    <ErrorBoundary
                                        fallback={(retry) => (
                                            <PlaceholderState
                                                icon="alert"
                                                title={_(msg`The OSC studio hit a problem`)}
                                                sub={_(
                                                    msg`Your bot keeps running in Wand. Reload the studio to continue.`,
                                                )}
                                                action={_(msg`Reload studio`)}
                                                onAction={retry}
                                            />
                                        )}
                                    >
                                        <Suspense fallback={<StudioLoading />}>
                                            <OscStudio session={osc.session} />
                                        </Suspense>
                                    </ErrorBoundary>
                                ) : !session.connected || !trainer.activeTrainer ? (
                                    <SessionPlaceholder
                                        connected={session.connected}
                                        activeTrainer={trainer.activeTrainer}
                                        onOpenLibrary={shell.openLibrary}
                                        onOpenSettings={shell.openSettings}
                                    />
                                ) : (
                                    <>
                                        <TrainerHeader
                                            trainer={trainer.activeTrainer}
                                            game={library.currentGame}
                                            isPinned={Boolean(library.currentGame?.pinned)}
                                            onPin={() =>
                                                library.currentGame &&
                                                library.togglePin(library.currentGame)
                                            }
                                        />
                                        <QuickActions
                                            presets={trainer.presets}
                                            onAddPreset={trainer.addPreset}
                                            onApplyPreset={trainer.applyPreset}
                                            onDeletePreset={trainer.deletePreset}
                                            onPanic={trainer.panic}
                                        />
                                        <div className="sticky top-0 z-10 -mx-3.5 mb-2.5 px-3.5 py-0.5">
                                            <SearchInput
                                                value={trainer.query}
                                                placeholder={_(msg`Search mods`)}
                                                onChange={trainer.setQuery}
                                            />
                                        </div>
                                        <div className="deck-mods">
                                            {trainer.filteredPinnedGroup ? (
                                                <CategorySection
                                                    forceOpen={Boolean(trainer.query)}
                                                    group={trainer.filteredPinnedGroup}
                                                    values={session.values}
                                                    pendingTargets={session.pendingTargets}
                                                    pinnedTargets={trainer.pinnedTargets}
                                                    disabled={trainer.controlsDisabled}
                                                    onCheatChange={trainer.changeCheat}
                                                    onTogglePin={trainer.togglePin}
                                                />
                                            ) : null}
                                            {trainer.filteredGroups.map((group, index) => (
                                                <CategorySection
                                                    key={group.id}
                                                    forceOpen={Boolean(trainer.query)}
                                                    group={group}
                                                    openByDefault={index < 2}
                                                    values={session.values}
                                                    pendingTargets={session.pendingTargets}
                                                    pinnedTargets={trainer.pinnedTargets}
                                                    disabled={trainer.controlsDisabled}
                                                    onCheatChange={trainer.changeCheat}
                                                    onTogglePin={trainer.togglePin}
                                                />
                                            ))}
                                        </div>
                                        {trainer.query && trainer.totalVisibleCheats === 0 ? (
                                            <p className="px-8 py-8 text-center text-[13px] text-(--deck-fg-4)">
                                                <Trans>No mods match "{trainer.query}"</Trans>
                                            </p>
                                        ) : null}
                                        <div className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-(--deck-fg-4)">
                                            {trainer.query
                                                ? _(msg`${trainer.totalVisibleCheats} matches`)
                                                : _(msg`END · ${trainer.totalCheats} MODS`)}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <FloatingDock
                        status={session.status}
                        view={shell.view}
                        oscState={osc.state}
                        hidden={shell.dockHidden}
                        leftHasBadge={!session.connected}
                        rightHasBadge={session.connected && !library.currentGame}
                        onOpenSettings={shell.openSettings}
                        onOpenLibrary={shell.openLibrary}
                        onViewChange={shell.setView}
                    />

                    <Drawer
                        open={shell.leftOpen}
                        side="left"
                        label={_(msg`Settings`)}
                        onClose={shell.closeSettings}
                    >
                        <SettingsDrawer
                            status={session.status}
                            wsUrl={session.wsUrl}
                            currentGame={library.currentGame}
                            currentTrainer={trainer.activeTrainer}
                            lastError={session.lastError}
                            onClose={shell.closeSettings}
                            onConnect={session.connect}
                            onDisconnect={session.disconnect}
                            onWsUrlChange={session.setWsUrl}
                        />
                    </Drawer>
                    <Drawer
                        open={shell.rightOpen}
                        side="right"
                        label={_(msg`Game library`)}
                        onClose={shell.closeLibrary}
                    >
                        <LibraryDrawer
                            games={library.games}
                            query={library.query}
                            canLaunch={session.connected}
                            onClose={shell.closeLibrary}
                            onPin={library.togglePin}
                            onPlay={library.playGame}
                            onStop={library.stopPlaying}
                            onQueryChange={library.setQuery}
                        />
                    </Drawer>
                </section>
            </div>
        </main>
    );
};

const StudioLoading = () => {
    return (
        <div className="flex min-h-[50svh] items-center justify-center">
            <span className="size-8 rounded-full border-2 border-white/10 border-t-(--deck-accent) motion-safe:animate-spin" />
        </div>
    );
};
