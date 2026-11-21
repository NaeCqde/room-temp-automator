import { loadConfig } from './config.ts';
import { runLoop } from './engine.ts';
import { listDevices } from './list-devices.ts';

const USAGE = `Usage: room-temp-automator [command]

Commands:
  (none)         run: poll the sensor and fire the actions of the triggers
  list-devices   list the SwitchBot devices (deviceId for [sensor.config].device_id)
  help           show this message\n\nOptions:\n  -c, --config <path>   config file (default: ./config.toml)`;

// The first argument is the command unless it is an option (`--config <path>` alone runs the daemon).
const first = process.argv[2];
const command = first?.startsWith('-') && first !== 'help' && first !== '--help' && first !== '-h' ? undefined : first;

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
