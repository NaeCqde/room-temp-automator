import type { HttpOptions } from './http.ts';

export type Direction = 'up' | 'down';

export type Trigger = {
    id: number;
    direction: Direction;
    temp: number;
};

export type ActionDef = {
    id: number;
    plugin: string;
    payload: string;
};

export type SensorConfig = {
    plugin: string;
    pollIntervalSeconds: number;
    config: Record<string, unknown>;
};

export type StartupCustomAction = {
    // Off by default; plugin/payload may be left blank when disabled.
    enabled: boolean;
    plugin: string;
    payload: string;
};

export type StartupConfig = {
    // If the first reading at startup is already at/below the lowest configured
    // trigger temp, immediately fire that trigger's action instead of waiting for
    // a future crossing (which would never happen if we're already past it).
    fireBelowMin: boolean;
    // Same idea, for the highest configured trigger temp.
    fireAboveMax: boolean;
    // Runs once at startup instead of/in addition to the above, when the current
    // temperature isn't already covered by an active fireBelowMin/fireAboveMax.
    customAction: StartupCustomAction;
};

export type Config = {
    http: HttpOptions;
    sensor: SensorConfig;
    startup: StartupConfig;
    triggers: Trigger[];
    actions: ActionDef[];
    // Per-plugin config tables, e.g. plugins["switchbot-aircon"] = { base_url: "..." }
    plugins: Record<string, Record<string, unknown>>;
};

// A sensor plugin knows how to obtain the current room temperature.
export interface SensorPlugin {
    name: string;
    getTemperature(config: Record<string, unknown>): Promise<number>;
}

// An action plugin knows how to execute one predefined action given a free-form payload string.
export interface ActionPlugin {
    name: string;
    execute(payload: string, config: Record<string, unknown>): Promise<void>;
}
