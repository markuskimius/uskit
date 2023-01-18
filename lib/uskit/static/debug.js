/* ***************************************************************************
* GLOBALS
*/

const DEBUG_LEVEL = {
    "ERROR"   : true,
    "WARNING" : true,
    "INFO"    : true,
    "TRACE"   : true,
    "SOCKET"  : true,
    "DEBUG"   : true,
};


/* ***************************************************************************
* FUNCTIONS
*/

export function log(level, ...args) {
    if(DEBUG_LEVEL[level]) {
        console.log(`[${level}]`, ...args);
    }
}

export function info(...args) {
    log("INFO", ...args);
}

export function socket(...args) {
    log("SOCKET", ...args);
}

export function debug(...args) {
    const stack = new Error().stack.split("\n").slice(2).join("\n");

    log("DEBUG", ...args, `\n${stack}`);
}

export function trace(...args) {
    const frame = new Error().stack.split("\n")[2].trim();

    log("TRACE", ...args, frame);
}

export function warning(...args) {
    log("WARNING", ...args);
}

export function error(...args) {
    const stack = new Error().stack;

    log("ERROR", ...args, stack);
}

