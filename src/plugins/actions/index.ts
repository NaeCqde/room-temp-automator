import type { ActionPlugin } from '../../types.ts';
import { switchbotAirconAction } from './switchbot-aircon.ts';

// All action plugins must be statically imported and registered here so that
// `bun build --compile` bundles them directly into the built .exe.
export const actionPlugins: Record<string, ActionPlugin> = {
    [switchbotAirconAction.name]: switchbotAirconAction,
};
