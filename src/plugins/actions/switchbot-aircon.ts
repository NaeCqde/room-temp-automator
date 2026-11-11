import { fetchWithRetry } from '../../http.ts';
import type { ActionPlugin } from '../../types.ts';

// Executes an action by calling the switchbot-aircon HTTP API
// (https://github.com/NaeCqde/switchbot-aircon), which must be running separately.
// The payload is passed through as-is to its `/parameter/{temperature},{mode},{fanSpeed},{power}` route.
export const switchbotAirconAction: ActionPlugin = {
    name: 'switchbot-aircon',

    async execute(payload, config) {
        const baseUrl = ((config.base_url as string | undefined) ?? 'http://127.0.0.1:10510').replace(/\/$/, '');

        const response = await fetchWithRetry('switchbot-aircon', `${baseUrl}/parameter/${payload}`, { method: 'POST' });

        if (!response.ok) {
            throw new Error(
                `[ERROR] switchbot-aircon: request failed: ${response.status} ${response.statusText} - ${await response.text()}`,
            );
        }
    },
};
