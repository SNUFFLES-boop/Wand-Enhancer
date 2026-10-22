import { loadJson, saveJson } from '@/shared/storage';

// Per-device layout of the OSC studio: section order, collapsed and hidden sections.
export enum EStudioSection {
    Chatbox = 'chatbox',
    Bindings = 'bindings',
    Network = 'network',
    Addresses = 'addresses',
    Monitor = 'monitor',
}

export type StudioLayout = {
    order: EStudioSection[];
    collapsed: EStudioSection[];
    hidden: EStudioSection[];
};

const STORAGE_KEY = 'wand-remote.osc-studio-layout.v1';
const ALL_SECTIONS = Object.values(EStudioSection);

export const DEFAULT_STUDIO_LAYOUT: StudioLayout = {
    order: [...ALL_SECTIONS],
    collapsed: [EStudioSection.Addresses],
    hidden: [],
};

export function loadStudioLayout(): StudioLayout {
    return loadJson(STORAGE_KEY, reviveLayout, DEFAULT_STUDIO_LAYOUT);
}

export function saveStudioLayout(layout: StudioLayout): void {
    saveJson(
        STORAGE_KEY,
        layout,
        () => JSON.stringify(layout) === JSON.stringify(DEFAULT_STUDIO_LAYOUT),
    );
}

export function moveSection(
    layout: StudioLayout,
    section: EStudioSection,
    direction: -1 | 1,
): StudioLayout {
    const order = [...layout.order];
    const index = order.indexOf(section);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= order.length) {
        return layout;
    }
    [order[index], order[swap]] = [order[swap], order[index]];
    return { ...layout, order };
}

export function toggleSectionFlag(
    layout: StudioLayout,
    flag: 'collapsed' | 'hidden',
    section: EStudioSection,
): StudioLayout {
    const current = layout[flag];
    return {
        ...layout,
        [flag]: current.includes(section)
            ? current.filter((entry) => entry !== section)
            : [...current, section],
    };
}

function reviveLayout(raw: unknown): StudioLayout | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const value = raw as Record<string, unknown>;
    const pick = (list: unknown) =>
        Array.isArray(list)
            ? ALL_SECTIONS.filter((section) => list.includes(section))
            : ([] as EStudioSection[]);
    const order = Array.isArray(value.order)
        ? (value.order.filter((entry): entry is EStudioSection =>
              ALL_SECTIONS.includes(entry as EStudioSection),
          ) as EStudioSection[])
        : [];
    // Sections added in a later version are appended, so a stored layout never hides them.
    for (const section of ALL_SECTIONS) {
        if (!order.includes(section)) order.push(section);
    }
    return {
        order: [...new Set(order)],
        collapsed: pick(value.collapsed),
        hidden: pick(value.hidden),
    };
}
