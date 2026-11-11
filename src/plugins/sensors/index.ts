import type { SensorPlugin } from '../../types.ts';
import { switchbotHubSensor } from './switchbot-hub.ts';

// All sensor plugins must be statically imported and registered here so that
// `bun build --compile` bundles them directly into the built .exe.
export const sensorPlugins: Record<string, SensorPlugin> = {
    [switchbotHubSensor.name]: switchbotHubSensor,
};
