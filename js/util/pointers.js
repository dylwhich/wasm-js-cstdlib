// Arrays we can use to evaluate each array
let membuf;
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

const utfDecoder = new TextDecoder("utf-8");
const utfEncoder = new TextEncoder("utf-8");
const utf16Decoder = new TextDecoder("utf-16");

let heapOffset = 0;

let heapBase = undefined;

export const endian = (() => {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setInt16(0, 256, true /* littleEndian */);
    // Int16Array uses the platform's endianness.
    return new Int16Array(buffer)[0] === 256;
  })();

export default function configure(imports, settings) {
    console.log("littleEndian:", endian); // true or false

    const memory = imports.env.memory;
    membuf = memory.buffer;
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

export function postInstantiate(instance) {
    heapBase = instance.exports.__heap_base;
}

export function allocStaticHeap(sz, align) {
    if (heapBase == "undefined") {
        console.error("Can't allocate static heap memory")
        return -1;
    }

    // make sure the heap is aligned as requested
    if ((heapBase + heapOffset) % (align) != 0) {
        heapOffset += (align - (heapBase + heapOffset) % align);
    }

    const result = heapBase + heapOffset;
    // Adance the heap offset by
    heapOffset += sz;
    console.log("Allocated %o static heap bytes", sz);
    return result;
}

export function getStaticHeapSize() {
    return heapOffset;
}

export function hexdump(ptr, length=8) {
    let paddedAddr = parseInt(ptr).toString(16);
    while (paddedAddr.length < 8) {
        paddedAddr = "0" + paddedAddr;
    }

    const view = new DataView(membuf, ptr, length);
    //console.log("data is %o", typeof(data));
    let hexdump = "";
    for (let i = 0; i < length; i++) {
        //console.log("type of data[i] === ", typeof(data[i]));
        let digits = view.getUint8(i).toString(16);
        if (digits.length < 2) {
            digits = "0" + digits;
        }

        if (i != 0 && !(i % 16)) {
            hexdump += "\n";
            // Line every 16 bytes
        } else if (i != 0 && !(i % 4)) {
            // Extra spacing every 4 bytes
            hexdump += "    ";
        } else {
            // Space between each byte
            hexdump += " ";
        }

        hexdump += digits;
    }

    console.log("0x%s:\n%s", paddedAddr, hexdump);
}

/**
 * Converts a char* pointer to a JS String
 * @param {*} ptr
 */
export function getStr(ptr) {
    // make sure len and ptr are ints, not floats!
    let len = 0|0;
    ptr |= 0;

    for (let i = ptr; HEAPU8[i] != 0; i++) {
        len++;
    }

    // Get a subarray (view) of the string and decode it
    return utfDecoder.decode(HEAPU8.subarray(ptr, ptr + len));
}

/**
 * Converts a wchar_t* pointer to a JS string
 * @param {*} ptr
 * @returns
 */
export function getWideStr(ptr) {
    let len = 0|0;
    ptr |= 0;

    for (let i = ptr; HEAPU16[i >> 1] != 0; i+= 2) {
        len++;
    }

    return utf16Decoder.decode(HEAP16.subarray(ptr >> 1, (ptr >> 1) + len));
}

// Return a new buffer containing the given string
export function newStrBuf(str) {
    const result = new Uint8Array(str.length + 1);
    for (let i = 0; i < str.length; i++) {
        result[i] = str.charCodeAt(i);
    }
    result[str.length] = 0;
}


export function writeStr(dst, str) {
    // SLICE: Returns a copy
    // SUBARRAY: Returns a view
    return utfEncoder.encodeInto(str, dst);
}

export function getPtr(addr) {
    //console.log("getPtr(%o)", addr);
    return new DataView(membuf, addr);
}

export function getPtrAligned(addr, align) {
    let aligned = (((addr+align-1) / align) | 0) * align;
    //console.log("getPtrAligned(%o, %o) -> %o", addr, align, aligned);
    return new DataView(membuf, aligned);
}

export function getMemView(addr, len) {
    return new DataView(membuf, addr, len);
}

export function getArrInt8(ptr, len) {
    return HEAP8.subarray(ptr, ptr + len);
}

export function getPtrInt8(ptr) {
    return getArrInt8(ptr, 1);
}

export function getArrUint8(ptr, len) {
    return HEAPU8.subarray(ptr, ptr + len);
}

export function getPtrUint8(ptr) {
    return getArrUint8(ptr, 1);
}

export function getArrInt16(ptr, len) {
    return HEAP16.subarray(ptr >> 1, (ptr >> 1) + len);
}

export function getPtrInt16(ptr) {
    return getArrInt16(ptr, 1);
}

export function getArrUint16(ptr, len) {
    return HEAPU16.subarray(ptr >> 1, (ptr >> 1) + len);
}

export function getPtrUint16(ptr) {
    return getArrUint16(ptr, 1);
}

export function getArrInt32(ptr, len) {
    return HEAP32.subarray(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrInt32(ptr) {
    return getArrInt32(ptr, 1);
}

export function getArrUint32(ptr, len) {
    return HEAPU32.subarray(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrUint32(ptr) {
    return getArrUint32(ptr, 1);
}

export function getArrInt64(ptr, len) {
    return HEAP64.subarray(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrInt64(ptr) {
    return getArrInt64(ptr, 1);
}

export function getArrUint64(ptr, len) {
    return HEAPU64.subarray(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrUint64(ptr) {
    return getArrUint64(ptr, 1);
}

export function getArrFloat(ptr, len) {
    return HEAPF32.subarray(ptr >> 2, (ptr >> 2) + len);
}

export function getPtrFloat(ptr) {
    return getArrFloat(ptr, 1);
}

export function getArrDouble(ptr, len) {
    return HEAPF64.subarray(ptr >> 4, (ptr >> 4) + len);
}

export function getPtrDouble(ptr) {
    return getArrDouble(ptr, 1);
}
