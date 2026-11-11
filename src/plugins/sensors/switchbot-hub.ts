import crypto from 'crypto';

import type { SensorPlugin } from '../../types.ts';

// Reads room temperature from a SwitchBot device (e.g. Hub 3, Meter, MeterPlus)
// via the official SwitchBot Cloud API (OpenAPI v1.1): GET /v1.1/devices/{deviceId}/status
// https://github.com/OpenWonderLabs/SwitchBotAPI

type SwitchBotStatusResponse = {
    statusCode: number;
    message: string;
    body?: {
        temperature?: number;
    };
};

function signRequest(token: string, secret: string): { t: string; nonce: string; sign: string } {
    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const data = token + t + nonce;
    const sign = crypto.createHmac('sha256', secret).update(Buffer.from(data, 'utf-8')).digest('base64');
    return { t, nonce, sign };
}

export const switchbotHubSensor: SensorPlugin = {
    name: 'switchbot-hub',

    async getTemperature(config) {
        const token = config.token as string | undefined;
        const secret = config.secret as string | undefined;
        const deviceId = config.device_id as string | undefined;

        if (!token || !secret || !deviceId) {
            throw new Error(
                '[ERROR] switchbot-hub sensor plugin requires "token", "secret" and "device_id" ' +
                    'in [sensor.config] of config.toml',
            );
        }

        const { t, nonce, sign } = signRequest(token, secret);

        const response = await fetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/status`, {
            method: 'GET',
            headers: {
                Authorization: token,
                sign,
                t,
                nonce,
                'Content-Type': 'application/json; charset=utf8',
            },
        });

        if (!response.ok) {
            throw new Error(
                `[ERROR] switchbot-hub: failed to get device status: ${response.status} ${response.statusText}`,
            );
        }

        const json = (await response.json()) as SwitchBotStatusResponse;
        if (json.statusCode !== 100 || json.body?.temperature === undefined) {
            throw new Error(`[ERROR] switchbot-hub: failed to get temperature: ${json.message ?? 'unknown error'}`);
        }

        return json.body.temperature;
    },
};
