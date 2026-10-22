import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import { SearchInput } from '@/shared/ui/SearchInput';
import { isNumericCheat, isOptionCheat, isPressCheat } from '../../../protocol/cheat-kinds';
import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import { slugifyCheatName } from '../../../protocol/osc';
import { describeCheatInput } from '../model/bindings';
import { CopyButton } from './NetworkSection';
import { Eyebrow } from './StudioSection';

type Route = { path: string; args: string; description: MessageDescriptor };

const ROUTES: Route[] = [
    { path: '/panic', args: '', description: msg`Turn every toggle off` },
    { path: '/stop', args: '', description: msg`End the running trainer` },
    { path: '/launch', args: 's', description: msg`Launch a game by name or id` },
    { path: '/chatbox', args: 's', description: msg`Send a chatbox message (tokens work)` },
    { path: '/chatbox/clear', args: '', description: msg`Clear the chatbox` },
    { path: '/query', args: '', description: msg`Reply with the full state to the sender` },
];

const STATE_ADDRESSES: Route[] = [
    { path: '/game/running', args: 'i', description: msg`1 while a game or trainer runs` },
    { path: '/game/title', args: 's', description: msg`Current game title` },
    { path: '/trainer/active', args: 'i', description: msg`1 while a trainer is loaded` },
    { path: '/mods/on', args: 'i', description: msg`Toggles currently on` },
    { path: '/mods/total', args: 'i', description: msg`Mods in this trainer` },
];

type AddressBookSectionProps = {
    prefix: string;
    autoMap: boolean;
    cheats: CheatSchema[];
};

export const AddressBookSection = ({ prefix, autoMap, cheats }: AddressBookSectionProps) => {
    const { _ } = useLingui();
    const [query, setQuery] = useState('');
    const needle = query.trim().toLowerCase();
    const visible = cheats.filter(
        (cheat) =>
            !needle ||
            cheat.name.toLowerCase().includes(needle) ||
            cheat.target.toLowerCase().includes(needle),
    );

    return (
        <div className="space-y-4">
            {!autoMap ? (
                <p className="rounded-[10px] border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
                    <Trans>Auto-map is off under Network, so these addresses are ignored.</Trans>
                </p>
            ) : null}

            <div>
                <Eyebrow>
                    <Trans>Commands</Trans>
                </Eyebrow>
                <AddressList prefix={prefix} routes={ROUTES} />
            </div>

            <div>
                <Eyebrow>
                    <Trans>Mods</Trans>
                </Eyebrow>
                {cheats.length === 0 ? (
                    <p className="text-[12px] text-(--deck-fg-3)">
                        <Trans>Start a trainer to see its mod addresses.</Trans>
                    </p>
                ) : (
                    <>
                        <SearchInput
                            value={query}
                            placeholder={_(msg`Filter mods`)}
                            onChange={setQuery}
                        />
                        <p className="mb-2 mt-2 text-[11.5px] leading-snug text-(--deck-fg-3)">
                            <Trans>
                                Send a value to set it. Append /toggle, /inc, /dec or /add to step.
                                The name slug works as well as the id.
                            </Trans>
                        </p>
                        <ul className="overflow-hidden rounded-[12px] border border-white/8">
                            {visible.map((cheat, index) => {
                                const address = `${prefix}/cheat/${cheat.target}`;
                                const slug = slugifyCheatName(cheat.name);
                                return (
                                    <li
                                        key={cheat.uuid}
                                        className={index ? 'border-t border-white/6' : undefined}
                                    >
                                        <div className="flex items-center gap-2 px-3 py-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate text-[12.5px] font-medium text-(--deck-fg)">
                                                        {cheat.name}
                                                    </span>
                                                    <span className="shrink-0 rounded-[4px] bg-white/6 px-1 font-mono text-[9.5px] text-(--deck-fg-3)">
                                                        {argHint(cheat)}
                                                    </span>
                                                </div>
                                                <div className="truncate font-mono text-[11px] text-(--deck-accent)">
                                                    {address}
                                                </div>
                                                <div className="truncate font-mono text-[10px] text-(--deck-fg-4)">
                                                    {describeCheatInput(cheat)}
                                                    {slug && slug !== cheat.target
                                                        ? ` · alias /cheat/${slug}`
                                                        : ''}
                                                </div>
                                            </div>
                                            <CopyButton
                                                value={address}
                                                label={_(msg`Copy ${address}`)}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>

            <div>
                <Eyebrow>
                    <Trans>State mirror (outputs with State mirror on)</Trans>
                </Eyebrow>
                <AddressList prefix={prefix} routes={STATE_ADDRESSES} />
            </div>
        </div>
    );
};

const AddressList = ({ prefix, routes }: { prefix: string; routes: Route[] }) => {
    const { _ } = useLingui();

    return (
        <ul className="overflow-hidden rounded-[12px] border border-white/8">
            {routes.map((route, index) => {
                const address = `${prefix}${route.path}`;
                return (
                    <li key={route.path} className={index ? 'border-t border-white/6' : undefined}>
                        <div className="flex items-center gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-[11.5px] text-(--deck-fg)">
                                    {address}
                                    {route.args ? (
                                        <span className="ml-1.5 text-(--deck-fg-4)">
                                            ,{route.args}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="truncate text-[11px] text-(--deck-fg-3)">
                                    {_(route.description)}
                                </div>
                            </div>
                            <CopyButton value={address} label={_(msg`Copy ${address}`)} />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};

function argHint(cheat: CheatSchema): string {
    if (cheat.type === ECheatType.Toggle) return 'i/T';
    if (isPressCheat(cheat)) return 'impulse';
    if (isNumericCheat(cheat)) return 'f';
    if (isOptionCheat(cheat)) return 's/i';
    return cheat.type;
}
