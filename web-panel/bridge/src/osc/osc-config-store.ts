import fs from 'node:fs';
import path from 'node:path';

import {
    createDefaultOscConfig,
    normalizeOscConfig,
    type OscBotConfig,
} from '../../../protocol/osc';
import type { LogFn } from '../types';

export type OscConfigStore = {
    readonly file: string | null;
    load(): OscBotConfig;
    save(config: OscBotConfig): boolean;
};

/**
 * Persists the bot profile as JSON. Without a file (tests, the standalone runtime) the profile
 * lives in memory only, so nothing outside the user's Wand profile is ever written.
 */
export function createOscConfigStore(file: string | null | undefined, log: LogFn): OscConfigStore {
    const target = file || null;

    return {
        file: target,
        load() {
            if (!target) {
                return createDefaultOscConfig();
            }

            try {
                return normalizeOscConfig(JSON.parse(fs.readFileSync(target, 'utf8')));
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                    log('warn', `Ignoring unreadable OSC bot config at ${target}.`, error);
                }
                return createDefaultOscConfig();
            }
        },
        save(config) {
            if (!target) {
                return true;
            }

            // Write-then-rename so a crash mid-save never leaves a truncated profile behind.
            const temporary = `${target}.${process.pid}.tmp`;
            try {
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
                fs.renameSync(temporary, target);
                return true;
            } catch (error) {
                log('warn', `Failed to save OSC bot config to ${target}.`, error);
                try {
                    fs.rmSync(temporary, { force: true });
                } catch {}
                return false;
            }
        },
    };
}
