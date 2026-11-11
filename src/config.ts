import { parse } from 'smol-toml';

import type {
    ActionDef,
    Config,
    Direction,
    SensorConfig,
    StartupConfig,
    StartupCustomAction,
    Trigger,
} from './types.ts';

const DEFAULT_CONFIG_PATH = 'config.toml';

function isDirection(value: unknown): value is Direction {
    return value === 'up' || value === 'down';
}

// triggers/actions are TOML tables keyed by id, e.g. [triggers.1], [actions.1] —
// the key is the id, so entries don't repeat it inside the table.
function entriesOf(raw: unknown): [string, any][] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return [];
    }
    return Object.entries(raw as Record<string, unknown>);
}

function parseTriggers(raw: unknown): Trigger[] {
    const entries = entriesOf(raw);
    if (entries.length === 0) {
        throw new Error('[ERROR] config.toml must have at least one entry under [triggers], e.g. [triggers.1]');
    }

    return entries.map(([key, t]) => {
        const id = Number(key);
        if (!Number.isFinite(id)) {
            throw new Error(`[ERROR] [triggers.${key}]: key must be numeric (the id)`);
        }
        if (!isDirection(t.direction)) {
            throw new Error(`[ERROR] triggers.${key}.direction must be "up" or "down"`);
        }
        if (typeof t.temp !== 'number') {
            throw new Error(`[ERROR] triggers.${key}.temp must be a number`);
        }
        return { id, direction: t.direction, temp: t.temp };
    });
}

function parseActions(raw: unknown): ActionDef[] {
    const entries = entriesOf(raw);
    if (entries.length === 0) {
        throw new Error('[ERROR] config.toml must have at least one entry under [actions], e.g. [actions.1]');
    }

    return entries.map(([key, a]) => {
        const id = Number(key);
        if (!Number.isFinite(id)) {
            throw new Error(`[ERROR] [actions.${key}]: key must be numeric (the id)`);
        }
        if (typeof a.plugin !== 'string') {
            throw new Error(`[ERROR] actions.${key}.plugin must be a string`);
        }
        if (typeof a.payload !== 'string') {
            throw new Error(`[ERROR] actions.${key}.payload must be a string`);
        }
        return { id, plugin: a.plugin, payload: a.payload };
    });
}

function parseSensor(raw: any): SensorConfig {
    if (!raw || typeof raw.plugin !== 'string') {
        throw new Error('[ERROR] config.toml must have a [sensor] table with a "plugin" key');
    }
    return {
        plugin: raw.plugin,
        pollIntervalSeconds: Number(raw.poll_interval_seconds ?? 60),
        config: raw.config ?? {},
    };
}

function parseCustomAction(raw: any): StartupCustomAction {
    const enabled = raw?.enabled ?? false;
    const plugin = typeof raw?.plugin === 'string' ? raw.plugin : '';
    const payload = typeof raw?.payload === 'string' ? raw.payload : '';

    if (enabled && (!plugin || !payload)) {
        throw new Error(
            '[ERROR] [startup.custom_action] must have non-empty "plugin" and "payload" when "enabled" is true',
        );
    }

    return { enabled, plugin, payload };
}

function parseStartup(raw: any): StartupConfig {
    return {
        fireBelowMin: raw?.fire_below_min ?? true,
        fireAboveMax: raw?.fire_above_max ?? true,
        customAction: parseCustomAction(raw?.custom_action),
    };
}

export async function loadConfig(path: string = resolveConfigPath()): Promise<Config> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
        throw new Error(`[ERROR] Config file not found: ${path}`);
    }

    const raw = parse(await file.text()) as any;

    const sensor = parseSensor(raw.sensor);
    const startup = parseStartup(raw.startup);
    const triggers = parseTriggers(raw.triggers);
    const actions = parseActions(raw.actions);
    const plugins: Record<string, Record<string, unknown>> = raw.plugins ?? {};

    // Every trigger must have a matching action with the same id (trigger id == action id).
    for (const trigger of triggers) {
        if (!actions.some((a) => a.id === trigger.id)) {
            throw new Error(
                `[ERROR] triggers.${trigger.id} has no matching actions.${trigger.id} entry with the same id`,
            );
        }
    }

    return { sensor, startup, triggers, actions, plugins };
}

// No env var override anymore (config is TOML-only) — only the default path or
// an explicit path passed as the first CLI argument.
function resolveConfigPath(): string {
    return process.argv[2] ?? DEFAULT_CONFIG_PATH;
}
