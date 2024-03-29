const SYNC_NORMAL_EXEC = 0|0;
const SYNC_UNWINDING = 1|0;
const SYNC_REWINDING = 2|0;

const DATA_ADDR = 16|0; // Where the unwind/rewind data structure will live.
let syncMode = SYNC_NORMAL_EXEC;
let syncCallIndex = 0;

let HEAPU32;

// Functions exported from wasm by bynsyncify
let asyncify_start_unwind;
let asyncify_stop_unwind;
let asyncify_start_rewind;
let asyncify_stop_rewind;
let asyncify_get_state;

let table;

let main;

const stack = [];
// map of stored values across calls in js
const locals = {};

export const START = 1;
export const SKIP = 2;
export const RETURN = 3;

/// Wrap a promise so it can easily be used from C
/// Note that this takes a function that returns a promise, NOT a promise
/// This is so a promise is only actually called once in the case of stack stuff
let wrapResult = undefined;
export function wrapPromise(promiseFunc) {
    if (asyncSuspend()) {
        promiseFunc().then((val) => {
            wrapResult = val;
            asyncResume();
        }).catch((err) => {
            wrapResult = err;
            asyncResume();
        });
        return 0;
    } else {
        const tmp = wrapResult;
        wrapResult = undefined;
        return tmp;
    }
}

export function asyncRestoreVars(tag, vars) {
    for (const [key, value] of Object.entries(locals[tag])) {
        vars[key] = value;
    }

    return vars;
}

export function asyncSuspend2(tag, callIndex, vars) {
    if (syncMode === SYNC_NORMAL_EXEC) {
        syncMode = SYNC_UNWINDING;

        if (typeof vars != "undefined") {
            locals[tag] = vars;
        }

        // We are called in order to start a sleep/unwind.
        // Fill in the data structure. The first value has the stack location,
        // which for simplicity we can start right after the data structure itself.

        HEAPU32[DATA_ADDR >> 2] = DATA_ADDR + 8;
        // The end of the stack will not be reached here anyhow.
        HEAPU32[DATA_ADDR + 4 >> 2] = 1024|0;
        asyncify_start_unwind(DATA_ADDR);

        // Return START, to indicate we are suspending -- the caller should start the async callback
        return START;
    } else if (syncMode === SYNC_REWINDING) {
        // Restore the locals, even if the call index is different?
        if (typeof vars == "object") {
            for (const [key, value] of Object.entries(locals[tag])) {
                vars[key] = value;
            }
        }

        if ((typeof callIndex == "undefined") || (callIndex == syncCallIndex)) {
            syncCallIndex = undefined;
            syncMode = SYNC_NORMAL_EXEC;
            asyncify_stop_rewind();

            return RETURN;
        }
    }

    // In all other cases, SKIP and leave the vars alone
    return SKIP;
}

export function asyncState() {
    return syncMode;
}

export function asyncResume() {
    if (syncMode === SYNC_UNWINDING) {
        syncMode = SYNC_REWINDING;
        asyncify_start_rewind(DATA_ADDR);
        // The code is now ready to rewind; to start the process, enter the
        // first function that should be on the call stack.
        // TODO does this need to be a different function??
        main();
    } else {
        console.error("asyncResume() called at inappropriate time -- state is %o", syncMode);
    }
}

export function asyncCancel() {
    // cancel the existing
    if (syncMode === SYNC_UNWINDING) {
        asyncify_stop_unwind();
        syncMode = SYNC_NORMAL_EXEC;
    } else {
        console.error("asyncCancel() called at inappropriate time -- state is %o", syncMode);
    }
}

export function asyncSuspend() {
    if (syncMode === SYNC_NORMAL_EXEC) {
        syncMode = SYNC_UNWINDING;

        // We are called in order to start a sleep/unwind.
        // Fill in the data structure. The first value has the stack location,
        // which for simplicity we can start right after the data structure itself.

        HEAPU32[DATA_ADDR >> 2] = DATA_ADDR + 8;
        // The end of the stack will not be reached here anyhow.
        HEAPU32[DATA_ADDR + 4 >> 2] = 1024|0;
        asyncify_start_unwind(DATA_ADDR);

        // Return true, to indicate we are suspending -- the caller should start the async callback
        return true;
    } else if (syncMode === SYNC_REWINDING) {
        // This is part of the resume -- the caller should continue after the async action
        asyncify_stop_rewind();
        syncMode = SYNC_NORMAL_EXEC;
        return false;
    } else {
        console.error("asyncResume() called at inappropriate time -- state is %o", syncMode);
        return false;
    }
}

export function postInstantiate(instance) {
    console.info("Exports: ", instance.exports);
    asyncify_start_unwind = instance.exports.asyncify_start_unwind;
    asyncify_stop_unwind = instance.exports.asyncify_stop_unwind;
    asyncify_start_rewind = instance.exports.asyncify_start_rewind;
    asyncify_stop_rewind = instance.exports.asyncify_stop_rewind;
    asyncify_get_state = instance.exports.asyncify_get_state;

    // Requires -Wl,--export-table
    table = instance.exports.__indirect_function_table;

    main = instance.exports.main;
}

export default function configure(imports, settings) {
    imports.bynsyncify.asyncSuspend = asyncSuspend;
    imports.bynsyncify.asyncCancel = asyncCancel;
    imports.bynsyncify.asyncResume = asyncResume;
    imports.bynsyncify.asyncState = asyncState;

    HEAPU32 = new Uint32Array(imports.env.memory.buffer);
}
