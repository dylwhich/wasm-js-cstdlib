import { getPtrUint32, getStr, getMemView, endian, setErrno } from './util/pointers.js';

export function exit(status) {
    if (typeof status != "undefined" && status != 0) {
        console.error("exit: %d", status);
    }
}

export const abs = Math.abs;
export const labs = Math.abs;
export const llabs = Math.abs;

export function atoi(nptr) {
    return parseInt(getStr(nptr));
}

export function atol(nptr) {
    return parseInt(getStr(nptr));
}

export function atoll(nptr) {
    return parseInt(getStr(nptr));
}

export function strtod(nptr, endptr) {
    const str = getStr(nptr);
    const result = parseFloat(str);

    if (Number.isNaN(result)) {
        return -1;
    }

    if (endptr != 0) {
        const floatRegex = /^(\s*)[+-]?[0-9]*[.]?[0-9]*([eE][+-]?[0-9]+)?/;
        const match = str.match(floatRegex);
        if (match) {
            const parsedLen = match[0].length|0;
            getMemView(endptr).setUint32(0, nptr + parsedLen, endian);
        }
    }

    return result;
}

export function strtof(nptr, endptr) {
    return strtod(nptr, endptr);
}

export function strtold(nptr, endptr) {
    return strtod(nptr, endptr);
}

export function getenv(name) {
    console.warn("NYI: getenv()");
    return 0;
}

export function qsort(base, nmemb, size, compar /* int (*compar)(void*, void*) */) {
    console.warn("NYI: qsort()");
}

export function srand(seed) {
    console.warn("NYI: srand(%d)", seed);
}

export function rand() {
    return (Math.random() * 2 - 1.0) * 2147483647;
}

export function _assert_fail() {
    return;
}

export function postIntsantiate(instance) {
    table = instance.exports.table;
}

export default function configure(imports, settings) {
    imports.env.exit = exit;
    imports.env.abs = abs;
    imports.env.labs = labs;
    imports.env.llabs = llabs;
    imports.env.atoi = atoi;
    imports.env.atol = atol;
    imports.env.atoll = atoll;
    imports.env.atoi = atoi;
    imports.env.getenv = getenv;
    imports.env.qsort = qsort;
    imports.env.srand = srand;
    imports.env.rand = rand;

    imports.env.strtof = strtof;
    imports.env.strtod = strtod;
    imports.env.strtold = strtold;

    imports.env._assert_fail = _assert_fail;
}