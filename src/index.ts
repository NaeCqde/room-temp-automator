import { loadConfig } from './config.ts';
import { runLoop } from './engine.ts';
import { listDevices } from './list-devices.ts';

const USAGE = `Usage: room-temp-automator [command]

Commands:
  (none)         run: poll the sensor and fire the actions of the triggers
  list-devices   list the SwitchBot devices (deviceId for [sensor.config].device_id)
  help           show this message`;

const command = process.argv[2];

switch (command) {
    case undefined: {
        const config = await loadConfig();
        await runLoop(config);
        break;
    }
    case 'list-devices':
        await listDevices();
        break;
    case 'help':
    case '--help':
    case '-h':
        console.info(USAGE);
        break;
    default:
        console.error(`Unknown command: ${command}\n\n${USAGE}`);
        process.exit(1);
}
