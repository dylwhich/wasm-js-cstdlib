export function postInstantiate(instance) {
    // idk? nothing??
}

export let asyncSuspend;
export let asyncCancel;
export let asyncResume;

export default function configure(imports, settings) {
    // it's ok to grab these because they're defined by the engine before calling configure()
    asyncSuspend = imports.bynsyncify.asyncSuspend;
    asyncCancel = imports.bynsyncify.asyncCancel;
    asyncResume = imports.bynsyncify.asyncResume;
}
