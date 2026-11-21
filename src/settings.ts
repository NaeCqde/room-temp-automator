import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';

// Where the settings files are read from: the current directory first; only when it has no such file, the directory of the
// executable (the one that is found is the only one that is read).

function exeDir(): string {
    // a compiled program lives in Bun's virtual file system: its real place is process.execPath
    const compiled = Bun.main.includes('$bunfs') || Bun.main.includes('~BUN');
    return dirname(compiled ? process.execPath : Bun.main);
}

/** The path of the settings file `name`: `./name` when it exists, else `<executable directory>/name` when that exists, else `./name`. */
export function findSettingsFile(name: string): string {
    if (existsSync(name)) {
        return name;
    }
    const beside = join(exeDir(), name);
    return existsSync(beside) ? beside : name;
}

// Bun reads `.env` of the current directory by itself; when there is none, the one next to the executable is read here
// (variables that are already set are kept). Importing this module first is all that is needed.
if (!existsSync('.env')) {
    const file = join(exeDir(), '.env');
    if (existsSync(file)) {
        for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
            if (process.env[key] === undefined && value !== undefined) {
                process.env[key] = value;
            }
        }
    }
}
