import crypto from 'crypto';

import { loadConfig } from './config.ts';

// Convenience script to look up a device's deviceId (e.g. your Hub 3) for use as
// `device_id` in config.toml's [sensor.config]. Uses the same official Cloud API
// and the same token/secret (from config.toml) as the switchbot-hub sensor plugin.

const config = await loadConfig();
const token = config.sensor.config.token as string | undefined;
const secret = config.sensor.config.secret as string | undefined;

if (!token || !secret) {
    console.error('Please provide "token" and "secret" in [sensor.config] of config.toml');
    process.exit(1);
}

const t = Date.now().toString();
const nonce = crypto.randomUUID();
const data = token + t + nonce;
const sign = crypto.createHmac('sha256', secret).update(Buffer.from(data, 'utf-8')).digest('base64');

const response = await fetch('https://api.switch-bot.com/v1.1/devices', {
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
    throw new Error(`[ERROR] Failed to list devices: ${response.status} ${response.statusText}`);
}

const json = (await response.json()) as {
    statusCode: number;
    message: string;
    body: {
        deviceList: { deviceId: string; deviceName: string; deviceType: string }[];
        infraredRemoteList: { deviceId: string; deviceName: string; remoteType: string }[];
    };
};

if (json.statusCode !== 100) {
    throw new Error(`[ERROR] Failed to list devices: ${json.message}`);
}

console.info('[INFO] Physical devices:');
for (const device of json.body.deviceList) {
    console.info(`  ${device.deviceName} (${device.deviceType}) - deviceId: ${device.deviceId}`);
}
