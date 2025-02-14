import { getPtrUint32, getStr, getPtr, getMemView, endian, setErrno } from './util/pointers.js';

let table;

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


const LDIGITS = "01234567890abcdefghijklmnopqrstuvwxyz";
const UDIGITS = "01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function strtol(nptr, endptr, base) {
    const str = getStr(nptr);

    let prefix = "";
    let found = "";

    let state = 0;
    let c = 0;
    let i = 0;
    while (i < str.length && 0 != (c = str.charCodeAt(i++))) {

        // 0: Whitespace
        if (state === 0 && isspace(c)) {
            // ignore whitespace
            continue;
        } else if (state == 0) {
            // end of whitespace, continue
            state++;
        }

        const strChar = String.fromCharCode(c);

        // 1: Sign
        if (state === 1) {
            if (strChar === '+' || strChar === '-') {
                found += strChar;
                state++;
                continue;
            } else {
                state++;
            }
        }

        // 2: Prefix
        if (state === 2) {
            if (base === 10) {
                // no prefix for decimal. continue immediately.
                state++;
            } else {
                // all the other things. no prefix,
                if (prefix.length === 0 && strChar === "0") {
                    prefix += strChar;
                    if (base == 8) {
                        // octal just has 0 prefix, so continue immediately
                        state++;
                    }

                    // next char
                    continue;
                } else if (prefix.length === 1 && (strChar === "x" || strChar === "X")) {
                    prefix += strChar;
                    if (base == 0) {
                        base = 16;
                    }
                    state++;
                    // next char
                    continue;
                } else {
                    // non-matched char, end of prefix
                    if (prefix === "0") {
                        base = 8;
                    } else if (!prefix && (base == 0)) {
                        base = 10;
                    }
                    // character is still unhandled, so go to the next state with this char (no continue)
                    state++;
                }
            }
        }

        // 3: Number
        if (state === 3) {
            const digits = LDIGITS.substring(0, base) + UDIGITS.substring(0, base);
            if (digits.includes(strChar)) {
                found += strChar;
                continue;
            } else {
                // unmatched char, keep trying to handle
                state++;
            }
        }

        // put last char back as it was not used
        break;
    }

    if (endptr != 0) {
        getPtrUint32(endptr).setUint32(nptr + i);
    }

    if (found) {
        return parseInt(found)|0;
    } else {
        return 0;
    }
}

export function strtoll(nptr, endptr, base) {
    return strtol(nptr, endptr, base);
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
    imports.env.getenv = getenv;
    imports.env.qsort = qsort;
    imports.env.srand = srand;
    imports.env.rand = rand;

    imports.env.strtof = strtof;
    imports.env.strtod = strtod;
    imports.env.strtold = strtold;

    imports.env.strtol = strtol;
    imports.env.strtoll = strtoll;

    imports.env._assert_fail = _assert_fail;
}
