/*
 *
 * Settings:
 *  - filesystem
 *
 */

// Internal, but still needs to be configured
import * as pointers from "./util/pointers.js";

// Header implementations
import assertConfig from "./assert.js";
import direntConfig from "./dirent.js";
import inttypesConfig from "./inttypes.js";
import mallocConfig, { postInstantiate as mallocPostInst } from "./malloc.js";
import mathConfig from "./math.js";
import stdargConfig from "./stdarg.js";
import stddefConfig from "./stddef.js";
import stdioConfig from "./stdio.js";
import stdlibConfig from "./stdlib.js";
import stringConfig from "./string.js";
import sys_typesConfig from "./sys/types.js";
import timeConfig from "./time.js";
import typesConfig from "./types.js";
import unistdConfig from "./unistd.js";

const baseConf = {
    filesystem: {
        "/": {
            type: "localstorage",
            flags: ["rw"],
        },
    },
}

export function postInstantiate(instance) {
    // Hand __heap_base to malloc()
    // - Note: it must be exported with -Wl,--export=__heap_base
    mallocPostInst(instance);
}

/**
 *
 * @param {WebAssembly.Memory} memory The WASM memory
 * @param {object} imports The WASM imports containing the memory and other function implementations
 * @param {?object} settings An object of settings for the library
 */
export default function configure(imports, settings) {
    if (settings === 'undefined') {
        settings = baseConf;
    }

    console.log("stdlib initializing...");

    const origKeyCount = Object.keys(imports.env).length;

    pointers.default(imports, settings);

    // Configure each module
    assertConfig(imports, settings);
    direntConfig(imports, settings);
    inttypesConfig(imports, settings);
    mallocConfig(imports, settings);
    mathConfig(imports, settings);
    stdargConfig(imports, settings);
    stddefConfig(imports, settings);
    stdioConfig(imports, settings);
    stdlibConfig(imports, settings);
    stringConfig(imports, settings);
    sys_typesConfig(imports, settings);
    timeConfig(imports, settings);
    typesConfig(imports, settings);
    unistdConfig(imports, settings);

    const newKeyCount = Object.keys(imports.env).length;
    console.log("stdlib added %d symbols to imports", newKeyCount - origKeyCount);
}
