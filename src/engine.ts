import { actionPlugins } from './plugins/actions/index.ts';
import { sensorPlugins } from './plugins/sensors/index.ts';
import { setHttpOptions } from './http.ts';
import type { Config, Trigger } from './types.ts';

// Edge-detection: a trigger fires once when the temperature crosses its threshold,
// not on every poll while it happens to be above/below it.
function crossed(trigger: Trigger, previous: number, current: number): boolean {
    if (trigger.direction === 'up') {
        return previous < trigger.temp && current >= trigger.temp;
    }
    return previous > trigger.temp && current <= trigger.temp;
}

function validatePlugins(config: Config): void {
    if (!sensorPlugins[config.sensor.plugin]) {
        throw new Error(
            `[ERROR] Unknown sensor plugin "${config.sensor.plugin}". Available: ${Object.keys(sensorPlugins).join(', ')}`,
        );
    }
    for (const action of config.actions) {
        if (!actionPlugins[action.plugin]) {
            throw new Error(
                `[ERROR] Unknown action plugin "${action.plugin}" (used by action id=${action.id}). Available: ${Object.keys(actionPlugins).join(', ')}`,
            );
        }
    }
    if (config.startup.customAction.enabled && !actionPlugins[config.startup.customAction.plugin]) {
        throw new Error(
            `[ERROR] Unknown action plugin "${config.startup.customAction.plugin}" (used by [startup.custom_action]). Available: ${Object.keys(actionPlugins).join(', ')}`,
        );
    }
}

function extrema(triggers: Trigger[]): { min: number; max: number } {
    const temps = triggers.map((t) => t.temp);
    return { min: Math.min(...temps), max: Math.max(...temps) };
}

// Why an action was fired, used to give startup-triggered actions a distinct log line.
type FireReason = 'crossed' | 'fire_below_min' | 'fire_above_max' | 'custom_action';

// At startup we only have a single reading, so there is no "crossing" to detect yet.
// If the room is already at/beyond the coldest or hottest configured trigger temp,
// fire that trigger's action immediately instead of waiting for a future crossing
// that may never happen (e.g. we start up already above the highest threshold).
async function runStartupChecks(config: Config, currentTemp: number): Promise<void> {
    const { min, max } = extrema(config.triggers);

    if (config.startup.fireBelowMin && currentTemp <= min) {
        for (const trigger of config.triggers.filter((t) => t.temp === min)) {
            console.info(
                `[INFO] Startup: current temperature ${currentTemp} is already at/below the minimum trigger temp ${min} -> firing trigger id=${trigger.id}`,
            );
            await fireAction(config, trigger.id, 'fire_below_min');
        }
    }

    if (config.startup.fireAboveMax && currentTemp >= max) {
        for (const trigger of config.triggers.filter((t) => t.temp === max)) {
            console.info(
                `[INFO] Startup: current temperature ${currentTemp} is already at/above the maximum trigger temp ${max} -> firing trigger id=${trigger.id}`,
            );
            await fireAction(config, trigger.id, 'fire_above_max');
        }
    }
}

// The custom startup action runs when the current temperature isn't already
// covered by an active fireBelowMin/fireAboveMax: if fireBelowMin is on, the room
// must be warmer than the minimum trigger temp; if fireAboveMax is on, it must be
// cooler than the maximum trigger temp. A disabled side imposes no constraint, so
// with both disabled the custom action always runs, and with both enabled it only
// runs strictly between the two (mirroring the fireBelowMin/fireAboveMax rules).
async function runStartupCustomAction(config: Config, currentTemp: number): Promise<void> {
    const custom = config.startup.customAction;
    if (!custom.enabled) {
        return;
    }

    const { min, max } = extrema(config.triggers);
    const aboveMin = config.startup.fireBelowMin ? currentTemp > min : true;
    const belowMax = config.startup.fireAboveMax ? currentTemp < max : true;

    if (!aboveMin || !belowMax) {
        return;
    }

    console.info(
        `[INFO] Startup: current temperature ${currentTemp} is not covered by fire_below_min/fire_above_max -> running custom startup action`,
    );

    await executeAction(config, custom.plugin, custom.payload, 'custom_action', '');
}

function fireLabel(reason: FireReason): string {
    switch (reason) {
        case 'fire_below_min':
            return 'Startup action (fire_below_min)';
        case 'fire_above_max':
            return 'Startup action (fire_above_max)';
        case 'custom_action':
            return 'Startup action (custom_action)';
        case 'crossed':
            return 'Action';
    }
}

// Shared by fireAction (trigger-linked actions, identified by idSuffix e.g. " id=3")
// and the startup custom action (no id, idSuffix "") so both log consistently.
async function executeAction(
    config: Config,
    pluginName: string,
    payload: string,
    reason: FireReason,
    idSuffix: string,
): Promise<void> {
    const plugin = actionPlugins[pluginName];
    if (!plugin) {
        console.error(`[ERROR] Unknown action plugin "${pluginName}"${idSuffix}`);
        return;
    }

    const pluginConfig = config.plugins[pluginName] ?? {};
    const label = fireLabel(reason);

    try {
        await plugin.execute(payload, pluginConfig);
        console.info(`[INFO] ${label}${idSuffix} (plugin=${pluginName}) executed with payload "${payload}"`);
    } catch (error) {
        console.error(`[ERROR] ${label}${idSuffix} (plugin=${pluginName}) failed:`, error);
    }
}

async function fireAction(config: Config, triggerId: number, reason: FireReason): Promise<void> {
    const action = config.actions.find((a) => a.id === triggerId);
    if (!action) {
        console.error(`[ERROR] No action found for trigger id=${triggerId}`);
        return;
    }

    await executeAction(config, action.plugin, action.payload, reason, ` id=${action.id}`);
}

export async function runLoop(config: Config): Promise<void> {
    validatePlugins(config);
    setHttpOptions(config.http);
    const sensor = sensorPlugins[config.sensor.plugin]!;

    console.info(
        `[INFO] Using sensor plugin "${sensor.name}", polling every ${config.sensor.pollIntervalSeconds}s`,
    );
    for (const trigger of config.triggers) {
        console.info(
            `[INFO] Trigger id=${trigger.id}: fire when temperature crosses ${trigger.direction} ${trigger.temp}`,
        );
    }

    let previousTemp: number | null = null;

    try {
        previousTemp = await sensor.getTemperature(config.sensor.config);
        console.info(`[INFO] Current temperature: ${previousTemp}`);
        await runStartupChecks(config, previousTemp);
        await runStartupCustomAction(config, previousTemp);
    } catch (error) {
        console.error(error);
    }

    while (true) {
        await Bun.sleep(config.sensor.pollIntervalSeconds * 1000);

        try {
            const currentTemp = await sensor.getTemperature(config.sensor.config);
            console.info(`[INFO] Current temperature: ${currentTemp}`);

            if (previousTemp !== null) {
                for (const trigger of config.triggers) {
                    if (crossed(trigger, previousTemp, currentTemp)) {
                        console.info(
                            `[INFO] Trigger id=${trigger.id} fired (${previousTemp} -> ${currentTemp}, crossed ${trigger.direction} ${trigger.temp})`,
                        );
                        await fireAction(config, trigger.id, 'crossed');
                    }
                }
            }

            previousTemp = currentTemp;
        } catch (error) {
            console.error(error);
        }
    }
}
