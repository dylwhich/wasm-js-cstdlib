import { getPtrInt64, getArrInt64 } from './util/pointers.js';

export function time(tloc) {
    const time = Date.now() / 1000 | 0;
    if (tloc != 0) {
        getPtrInt64(tloc)[0] = time;
    }

    return time;
}

export async function nanosleep(req, rem) {
    const start = Date.now();
    const tvReq = getArrInt64(req, 2);
    const tvRem = getArrInt64(rem, 2);

    await new Promise((resolve, reject) => {
        setTimeout(() => {
            const end = Date.now();

            if (rem != 0) {
                const msRem = end - (start + (tvReq[0] * 1000));
                const nsRem = end * 1000000 - (start * 1000000 + (tvReq[1]));
                tvRem[0] = (msRem < 0) ? 0 : (msRem / 1000);
                tvRem[1] = (nsRem < 0) ? 0 : (nsRem % 1000000);
            }

            resolve();
        }, tvReq[0] /*seconds*/ * 1000 + tvReq[1] /*nanos*/ / 1000000);
    });

    return 0;
}

export async function usleep(usec) {
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve();
        }, usec / 1000);
    });
    return 0;
}

export function clock_gettime(clockid, tp) {
    let time = 0;
    if (tp) {
        switch (clockid) {
            case 1:
                // Clock MONOTONIC
                time = window.performance.now ? window.performance.now() : Date.now();
                break;

            case 2:
                // Clock REALTIME
                time = Date.now();
                break;
        }

        const tv = getArrInt64(tp, 2);
        tv[0] = time / 1000;
        tv[1] = time % 1000000;
    }
    return 0;
}

export default function configure(imports, settings) {
    imports.env.time = time;
    imports.env.usleep = usleep;
    imports.env.nanosleep = nanosleep
    imports.env.clock_gettime = clock_gettime;
}
