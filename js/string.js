import { getArrUint8, getStr, writeStr, getMemView } from './util/pointers.js';
import { malloc } from './malloc.js';

export function memcmp(s1, s2, n) {
    const a1 = getArrUint8(s1, n);
    const a2 = getArrUint8(s2, n);

    for (let i = 0; i < n; i++) {
        if (a1[i] != a2[i]) {
            return a2[i] - a1[i];
        }
    }

    return 0;
}

export function memmove(dest, src, n) {
    const d = getArrUint8(dest);
    const s = getArrUint8(src);

    if (dest < src) {
        // dest is before src, so if the arrays overlap this won't cause issues
        for (let i = 0; i < n; i++) {
            d[i] = s[i];
        }
    } else {
        // src is before dest, so iterate backwards
        for (let i = n-1; i >= 0; i--) {
            d[i] = s[i];
        }
    }

    return dest;
}

export function memcpy(dest, src, n) {
    const d = getArrUint8(dest);
    const s = getArrUint8(src);

    for (let i = 0; i < n; i++) {
        d[i] = n[i];
    }

    return dest;
}

export function memset(s, c, n) {
    getArrUint8(s, n).fill(c & 0xFF);
}

export function strcat(dst, src) {
    const d = getMemView(dst);
    const s = getMemView(s);

    let i = 0;
    // advance to the end of the str
    while (d.getUint8(i) != 0) i++;

    let j = 0;
    do {
        d.setUint8(i+j, s.getUint8(j));
    } while (s.getUint8(j++) != 0);

    return dst;
}

export function strchr(s, c) {
    const jStr = getStr(s);
    const jChar = String.fromCharCode(c);

    const index = jStr.indexOf(jChar);
    if (index < 0) {
        return 0;
    } else {
        return s + index;
    }
}

export function strrchr(s, c) {
    const jStr = getStr(s);
    const jChar = String.fromCharCode(c);

    const index = jStr.lastIndexOf(jChar);
    if (index < 0) {
        return 0;
    } else {
        return s + index;
    }
}

export function strcmp(s1, s2) {
    const str1 = getStr(s1);
    const str2 = getStr(s2);
    return str1.localeCompare(str2);
}

export function strcpy(dst, src) {
    const d = getMemView(dst);
    const s = getMemView(s);

    let i = 0;
    do {
        d.setUint8(i, s.getUint8(i));
    } while (s.getUint8(i++) != 0);

    return dst;
}

export function stpcpy(dst, src) {
    const d = getMemView(dst);
    const s = getMemView(s);

    let i = 0;
    do {
        d.setUint8(i, s.getUint8(i));
    } while (s.getUint8(i++) != 0);

    return dst + i - 1;
}

export function strdup(src) {
    const str = getStr(src);
    const ptr = malloc(str.length + 1);
    strcpy(ptr, src);
    return ptr;
}

export function strlen(src) {
    return getStr(src).length;
}

export function strcasecmp(s1, s2) {
    const str1 = getStr(s1);
    const str2 = getStr(s2);

    return str1.toLowerCase().localeCompare(str2.toLowerCase());
}

export function strncasecmp(s1, s2, n) {
    const str1 = getStr(s1, n);
    const str2 = getStr(s2, n);
    return str1.toLowerCase().localeCompare(str2.toLowerCase());
}

export function strncmp(s1, s2, n) {
    return getStr(s1, n).localeCompare(getStr(s2, n));
}

export function strncpy(dst, src, n) {
    const d = getMemView(dst, n);
    const s = getStr(src, n);
    const sv = getMemView(src, n);

    let i = 0;
    do {
        d.setUint8(i, sv.getUint8(i));
    } while (s[i++] != 0);

    return dst;
}

export function strstr(haystack, needle) {
    const h = getStr(haystack);
    const n = getStr(needle);
    const res = h.indexOf(n);

    if (res < 0) {
        return 0;
    } else {
        return haystack + res;
    }
}

export default function configure(imports, settings) {
    // memcmp
    imports.env.memcmp = memcmp;
    // memmove
    imports.env.memmove = memmove;
    // memcpy
    imports.env.memcpy = memcpy;
    // memset
    imports.env.memset = memset;

    // strcat
    imports.env.strcat = strcat;
    // strchr
    imports.env.strchr = strchr;
    // strrchr
    imports.env.strrchr = strrchr;
    // strcmp
    imports.env.strcmp = strcmp;
    // strcpy
    imports.env.strcpy = strcpy;
    // stpcpy
    imports.env.stpcpy = stpcpy;
    // strdup
    imports.env.strdup = strdup;
    // strlen
    imports.env.strlen = strlen;
    // strcasecmp
    imports.env.strcasecmp = strcasecmp;
    // strncasecmp
    imports.env.strncasecmp = strncasecmp;
    // strncmp
    imports.env.strncmp = strncmp;
    // strncpy
    imports.env.strncpy = strncpy;
    // strstr
    imports.env.strstr = strstr;
}
