const SYNC_NORMAL_EXEC = 0|0;
const SYNC_UNWINDING = 1|0;
const SYNC_REWINDING = 2|0;

const DATA_ADDR = 16|0; // Where the unwind/rewind data structure will live.
let syncMode = SYNC_NORMAL_EXEC;
let syncFrame = 0;
let syncCallIndex = 0;

let syncTopFunc = [];

let HEAPU32;

// Functions exported from wasm by bynsyncify
let asyncify_start_unwind;
let asyncify_stop_unwind;
let asyncify_start_rewind;
let asyncify_stop_rewind;
let asyncify_get_state;

let table;

let main;

const rewindIndex = 0;
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

export function callExport(func, ...args) {
    let result = undefined;

    if (syncMode != SYNC_UNWINDING) {
        try {
            console.warn("callExport(%o, %o)", func, args);
            console.warn("syncTopFunc 0", syncTopFunc, func, args);
            syncTopFunc.push({func, args});
            console.warn("syncTopFunc 1: %o, func: %s, args: %s", syncTopFunc, func, args);
            result = func(...args);
        } finally {
            console.warn("Returning from callExport() -- state is %s", syncMode);
            if (syncMode != SYNC_UNWINDING) {
                console.warn("Popping syncTopFunc as we are not suspended");
                syncTopFunc.pop();
            }
        }

        return result;
    } else {
        console.warn("Not re-calling export due to async state???");
        return 0;
    }
}

export function runAsync(args, ...funcs) {
    const stackTop = (stack.length != 0) ? stack[stack.length-1] : undefined;
    // First, figure out where in the call stack we are
    if (syncMode === SYNC_NORMAL_EXEC) {
        // We are executing normally, and now we need to enter  We have found the section of this function the async context
        // This is where we should be after we finish unwinding, or have never rewound at all
        // Set up the stack
        const entry = {args, vars: [], calls: funcs, index: 0};
        stack.push(entry);

        // Save the call stack here
        syncMode = SYNC_UNWINDING;
        HEAPU32[DATA_ADDR >> 2] = DATA_ADDR + 8;
        HEAPU32[DATA_ADDR + 4 >> 2] = 1024|0;
        asyncify_start_unwind(DATA_ADDR);

        // now do the actual async call?
        entry.calls[0](entry.args).then((result) => {
            entry.vars.push(result);

            // Start rewinding the call stack back to where we just left off
            syncMode = SYNC_REWINDING;
            syncFrame = 0;
            asyncify_start_rewind(DATA_ADDR);

            // Call the function at the top of the stack: main?
            if (syncTopFunc.length > 0) {
                const info = syncTopFunc.pop();
                console.warn("Calling %s instead of main()", info.func);
                info.func(...info.args);
            } else {
                main(0, 0);
            }
        }, (err) => {
            console.error("Uncaught exception in runAsync(): %o", err);
            // TODO other error handling needed here?

            syncMode = SYNC_REWINDING;
            syncFrame = 0;
            asyncify_start_rewind(DATA_ADDR);

            // TODO should we actually do this? I guess so
            if (syncTopFunc.length > 0) {
                const info = syncTopFunc.pop();
                console.warn("Calling %s instead of main()", info.func);
                info.func(...info.args);
            } else {
                main(0, 0);
            }
        });

        return 0;
    } else if (syncMode === SYNC_REWINDING) {
        // We're rolling back up through the call stack, to find where we left off pre-async-call
        // This means we should "skip" this function and go deeper
        // But to actually do that, we need to re-call whichever branch of the function we called before

        if (!stackTop) {
            // There SHOULD be something on the top of the stack
            // We might not be at the top yet though
            console.error("call to runAsync() while UNWINDING, but there is no stack top!");
            return;
        }

        // First: Check if we're on the last frame of the stack
        // If so:
        //    Check if we're returning from the last call of the frame
        //    If so:
        //        Drop the last frame from the stack
        //        Go back to normal mode
        //    If not:
        //        Increment the call
        //        Call the callback function
        // If not (middle frame):
        //    Check if we're returning from the last call of the frame (mid-rewind)
        //    Increment the frame index
        //    Re-call into the current call index
        //

        const entry = stack[syncFrame];

        if (syncFrame == (stack.length - 1)) {
            // We're on the last frame of the stack
            if (entry.index == (entry.calls.length - 1)) {
                // And the last call in the index
                // That means we're done with this frame, and can return control to after
                stack.pop();
                syncMode = SYNC_NORMAL_EXEC;
                asyncify_stop_rewind();

                syncFrame--;

                // Return the final return value from the last call in the frame
                return entry.vars.pop();
            } else {
                // Not the last call in the index, go to the next step

                syncMode = SYNC_NORMAL_EXEC;
                asyncify_stop_rewind();

                entry.index++;
                const arg = entry.vars[entry.index-1];
                entry.calls[entry.index](arg).then((result) => {
                    entry.vars.push(result);

                    syncMode = SYNC_REWINDING;
                    syncFrame = 0;
                    asyncify_start_rewind(DATA_ADDR);

                }, (err) => {
                    console.error("Uncaught exception in runAsync(): %o", err);

                    syncMode = SYNC_REWINDING;
                    syncFrame = 0;
                    asyncify_start_rewind(DATA_ADDR);
                });

                return 0;
            }
        } else {
            // Somewhere in the middle of the stack -- just rewinding, won't resume
            syncFrame++;
            const arg = (entry.index > 0) ? entry.vars[entry.index-1] : entry.args;
            entry.calls[entry.index](arg).then((result) => {
                console.info("Discarding repeated result %o of already-called function %d (previous=%o)", result, entry.index, entry.vars[entry.index]);
            }, (err) => {
                console.error("Uncaught exception in runAsync(): %o", err);
            });

            return 0;
        }

        /*
         * Let's say we have one function that makes 2 async calls, and the first of those calls makes another async call.
         *
         * function C() {
         *   // no async
         *   return 5;
         * }
         *
         * function B() {
         *   // nested async
         *   await someFunction();
         * }
         *
         * function A() {
         *     await B();
         *     await C();
         * }
         *
         * 1. Call A()
         * 2. <B> asyncSuspend()
         * 3. --> B()
         * 4. <C> asyncSuspend()
         * 5. --> C()
         * 6. <C> return 5;
         * 7. <-- C(): asyncResume()
         * 8. main()
         * 9. --> A()
         * 10. -- >B(): skip (in)
         * 11. --> C(): skip
         */
    } else {
        // (ignore this comment)
        // We are rewinding the stack and might want to skip this call
        // But to actually skip it, we have to call it
        // This is where we increment the call index
        console.error("IDK what we're doing here, syncMode is %d, frame=%d?", syncMode, syncFrame);
        console.error(stack);
        return 0;
    }
}

export function asyncSuspend2(tagg, callIndex, vars) {
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
