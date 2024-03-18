// Arrays we can use to evaluate each array
let HEAP8;
let HEAPU8;
let HEAP16;
let HEAPU16;
let HEAP32;
let HEAPU32;
let HEAP64;
let HEAPU64;
let HEAPF32;
let HEAPF64;

let utfDecoder = new TextDecoder("utf-8");
let utfEncoder = new TextEncoder("utf-8");

export default function configure(memory, settings) {
    HEAP8 = new Int8Array(memory.buffer);
    HEAPU8 = new Uint8Array(memory.buffer);
    HEAP16 = new Int16Array(memory.buffer);
    HEAPU16 = new Uint16Array(memory.buffer);
    HEAP32 = new Uint32Array(memory.buffer);
    HEAPU32 = new Uint32Array(memory.buffer);
    HEAP64 = new BigInt64Array(memory.buffer);
    HEAPU64 = new BigUint64Array(memory.buffer);
    HEAPF32 = new Float32Array(memory.buffer);
    HEAPF64 = new Float64Array(memory.buffer);
}

/**
 * Converts a char* pointer to a JS String
 * @param {*} ptr
 */
export function getStr(ptr) {
    let len = 0;
    ptr |= 0;

    for (let i = ptr; HEAPU8[i] != 0; i++) {
        len++;
    }

    // Copy the string and decode it
    return utfDecoder.decode(HEAPU8.subarray(ptr, ptr + len))
}

export function writeStr(dst, str) {
    return utfEncoder.encodeInto(dst, str);
}

export function getArrInt8(ptr, len) {
    return HEAP8.slice(ptr, len);
}

export function getPtrInt8(ptr) {
    return getArrInt8(ptr, 1);
}

export function getArrUint8(ptr, len) {
    return HEAPU8.slice(ptr, len);
}

export function getPtrUint8(ptr) {
    return getArrUint8(ptr, 1);
}

export function getArrInt16(ptr, len) {
    return HEAP16.slice(ptr >> 1, (ptr >> 1) + len);
}

export function getPtrInt16(ptr) {
    return getArrInt16(ptr, 1);
}

export function getArrUint16(ptr, len) {
    return HEAPU16.slice(ptr >> 1, (ptr >> 1) + len);
}

export function getPtrUint16(ptr) {
    return getArrUint16(ptr, 1);
}

export function getArrInt32(ptr, len) {
    return HEAP32.slice(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrInt32(ptr) {
    return getArrInt32(ptr, 1);
}

export function getArrUint32(ptr, len) {
    return HEAPU32.slice(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrUint32(ptr) {
    return getArrUint32(ptr, 1);
}

export function getArrInt64(ptr, len) {
    return HEAP64.slice(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrInt64(ptr) {
    return getArrInt64(ptr, 1);
}

export function getArrUint64(ptr, len) {
    return HEAPU64.slice(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrUint64(ptr) {
    return getArrUint64(ptr, 1);
}

export function getArrFloat(ptr, len) {
    return HEAPF32.slice(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrFloat(ptr) {
    return getArrFloat(ptr, 1);
}

export function getArrDouble(ptr, len) {
    return HEAPF64.slice(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrDouble(ptr) {
    return getArrDouble(ptr, 1);
}
