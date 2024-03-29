/*
 *
 * Settings:
 *  - filesystem
 *
 */

// Internal, but still needs to be configured
import * as pointers from "./util/pointers.js";
import * as asyncify from "./util/asyncify.js";

// Header implementations
import assertConfig from "./assert.js";
import direntConfig from "./dirent.js";
import inttypesConfig from "./inttypes.js";
import mallocConfig, { postInstantiate as mallocPostInst } from "./malloc.js";
import mathConfig from "./math.js";
import stdargConfig from "./stdarg.js";
import stddefConfig from "./stddef.js";
import stdioConfig, { postInstantiate as stdioPostInst } from "./stdio.js";
import stdlibConfig from "./stdlib.js";
import stringConfig from "./string.js";
import sys_typesConfig from "./sys/types.js";
import timeConfig from "./time.js";
import typesConfig from "./types.js";
import unistdConfig from "./unistd.js";

const baseConf = {
    filesystem: {
        "/screenshot.*\\.png": [
            {
                type: "download",
                flags: ["wo"],
            }
        ],
        "/": [
            {
                // Try a plain old HTTP GET to the server root
                type: "http",
                base: "//",
                flags: ["ro"],
            }, {
                // Write any changes
                type: "localstorage",
                flags: ["rw"],
            }
        ],
    },
}

export function makeArgv() {
    // argv is an array of
    let argv = new Uint32Array(arguments.length);
}

let _extraModules;

export function postInstantiate(instance) {
    asyncify.postInstantiate(instance);
    pointers.postInstantiate(instance);

    stdioPostInst(instance);

    if (typeof _extraModules != "undefined") {
        for (let mod of _extraModules) {
            if (mod.postInstantiate) {
                mod.postInstantiate(instance);
            }
        }
    }

    // malloc goes last so any extra memory is already finalized
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
export default function configure(imports, settings, extraModules) {
    if (settings === 'undefined') {
        settings = baseConf;
    }

    console.log("stdlib initializing...");

    const origKeyCount = Object.keys(imports.env).length;

    asyncify.default(imports, settings);
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

    if (typeof extraModules != "undefined")
    {
        _extraModules = extraModules;

        for (let mod of extraModules) {
            if (mod.default) {
                mod.default(imports, settings);
            }
        }
    }

    const newKeyCount = Object.keys(imports.env).length;
    console.log("stdlib added %d symbols to imports", newKeyCount - origKeyCount);
}
