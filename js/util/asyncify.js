export function postInstantiate(instance) {
    // idk? nothing??
}

export let asyncSuspend;
export let asyncCancel;
export let asyncResume;

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


    /*return function(v) {
        if (asyncSuspend()) {
            v.promise().then((val) => {
                v.retval = val;
                asyncResume();
            }).catch((err) => {
                v.err = err;
                asyncResume();
            });
        } else {
            return v.retval;
        }
    }({ promise: promiseFunc, retval: undefined, err: null });*/
}

export default function configure(imports, settings) {
    // it's ok to grab these because they're defined by the engine before calling configure()
    asyncSuspend = imports.bynsyncify.asyncSuspend;
    asyncCancel = imports.bynsyncify.asyncCancel;
    asyncResume = imports.bynsyncify.asyncResume;
}
