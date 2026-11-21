import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Where the settings file is read from: the current directory first; only when it has no such file, the directory of the
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
