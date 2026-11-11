# room-temp-automator

English | [日本語](README.md)

A small daemon that polls the room temperature and, the moment it **crosses** a configured threshold (rising or falling), runs an action you attached to that trigger.
For example: "switch the air conditioner to cooling when it rises above 25.5 °C" or "switch to heating when it drops to 24 °C or below".

## Why

Apple Home automations ("when the temperature rises above…") often just don't run, even when the condition is met. So I wrote my own: it runs on a PC or a Raspberry Pi, polls the sensor itself, and reliably runs the action the moment a threshold is crossed.

## Not only for temperature

A trigger only watches for "a quantity crossed a threshold upward or downward". As long as a sensor plugin returns a number, it works for anything quantitative (you write the sensor and action plugins yourself), for example:

- humidity, CO₂, illuminance or power consumption controlling a device
- values from an external API (forecast temperature, electricity price, stock price...) polled to send a notification or operate something

Both how the value is read (sensor) and what is executed (action) are plugins.

| Kind | Built-in plugin | What it does |
|---|---|---|
| Sensor | `switchbot-hub` | Reads the temperature of a Hub 3 / Meter etc. through the SwitchBot Cloud API (OpenAPI v1.1). |
| Action | `switchbot-aircon` | Calls the HTTP API (`/parameter/...`) of [switchbot-aircon](https://github.com/NaeCqde/switchbot-aircon). |

## Install

Download the executable for your platform and `config.example.toml` from the [latest release](https://github.com/NaeCqde/room-temp-automator/releases/latest).

| File | Platform |
|---|---|
| `room-temp-automator-Windows-x86_64.exe` | Windows (x64) |
| `room-temp-automator-macOS-aarch64` | macOS (Apple Silicon) |
| `room-temp-automator-Linux-x86_64-musl` | Linux (x64) |
| `room-temp-automator-Linux-aarch64-musl` | Linux (arm64) |
| `config.example.toml` | Config template |

Each executable has a `.sha256` next to it. They are standalone (the Bun runtime is embedded), so nothing else needs to be installed. On macOS / Linux, run `chmod +x` first.

## Setup

1. Copy `config.example.toml` to `config.toml` in the folder you run the program from (the current working directory). Only `config.toml` is read; no environment variables / `.env`.
2. Set the SwitchBot `token` / `secret` in `[sensor.config]`. To get them: SwitchBot app → Profile → Settings → About → tap the app version repeatedly → Developer Options.
3. If you don't know the `device_id`, list your devices by running `room-temp-automator list-devices` with the token/secret set (from source: `bun run list-devices`) and put the deviceId of the temperature-reporting device (Hub 3, Meter...) into `[sensor.config].device_id`.
4. Start [switchbot-aircon](https://github.com/NaeCqde/switchbot-aircon) and set its address in `[plugins.switchbot-aircon].base_url`.

> `config.toml` holds your credentials. It is in `.gitignore`; never commit it.

## Run

```bash
./room-temp-automator-macOS-aarch64
./room-temp-automator-macOS-aarch64 list-devices   # list SwitchBot devices
./room-temp-automator-macOS-aarch64 --config /path/to/config.toml   # use another config file
```

## Run / build from source

Requires [Bun](https://bun.com).

```bash
bun install
cp config.example.toml config.toml
bun run start          # run
bun run list-devices   # list SwitchBot devices
bun run build          # build a standalone executable named room-temp-automator
```

## Configuration

`config.example.toml` is fully commented. In short:

```toml
[sensor]
plugin = "switchbot-hub"
poll_interval_seconds = 60

[sensor.config]
token = "..."
secret = "..."
device_id = "..."

# A trigger fires once, when the temperature crosses `temp` in `direction`.
[triggers.1]
direction = "up"      # "up": rose above temp, "down": fell to temp or below
temp = 25.5

# The action with the same id runs when the trigger fires.
[actions.1]
plugin = "switchbot-aircon"
payload = "23,cool,3,on"   # "{temperature},{mode},{fanSpeed},{power}"

[plugins.switchbot-aircon]
base_url = "http://127.0.0.1:10510"
```

Add as many `[triggers.<id>]` / `[actions.<id>]` pairs as you need.

### HTTP timeout and retries

Every HTTP request a plugin makes (SwitchBot API, switchbot-aircon) has a timeout and is retried on network errors, timeouts, HTTP 429 and 5xx, waiting twice as long each time (at most 30 s, or the server's `Retry-After`). Other 4xx responses (e.g. a wrong token) are not retried. Since a trigger fires only once, at the moment of the crossing, this keeps a temporary failure from losing the action.

```toml
[http]                      # all optional; these are the defaults
retries = 3                 # retries after the first attempt (0 = try once)
timeout_seconds = 10        # timeout of each attempt
retry_delay_seconds = 1     # wait before the first retry
```

### Startup behaviour

Right after startup there is only one reading, so no crossing can be detected yet.

- `fire_below_min` / `fire_above_max` (both default `true`): if the room is already at or below the lowest trigger temperature, or at or above the highest one, the matching trigger's action runs immediately. Other triggers fire only on a real crossing.
- `[startup.custom_action]` (disabled by default): an action that runs once at startup when the temperature is not covered by the two options above. With both enabled it runs when `lowest < temperature < highest`; with both disabled it always runs; with only one enabled, only that side's condition applies.

## Adding a plugin

Implement it in `src/plugins/sensors/` or `src/plugins/actions/` and register it in that directory's `index.ts`. Imports are static, so `--compile` bundles it into the executable automatically.

## License

MIT
