import { getStr, getWideStr, writeStr, getMemView, getArrUint8, getPtrAligned, endian, allocStaticHeap, getPtr } from './util/pointers.js'
import { isspace } from './ctype.js';
import { malloc } from './malloc.js';

export const EOF = -1;
export const F_OK = 0;
export const SEEK_SET = 0;
export const SEEK_CUR = 1;
export const SEEK_END = 2;

export const BUFSIZ = 8192;

const utf8Decoder = new TextDecoder("utf-8");
const utf8Encoder = new TextEncoder("utf-8");

class ArgInfo {
    constructor(type, width, view) {
        this.type = type;
        this.width = width;
        this.address = view ? view.byteOffset : 0;
        this.view = view;
    }

    readUint() {
        switch (this.width) {
            case 1:
                return this.view.getUint8();
            case 2:
                return this.view.getUint16(0, endian);
            case 4:
                return this.view.getUint32(0, endian);
            case 8:
                return this.view.getBigUint64(0, endian);
            default:
                return 0;
        }
    }

    readInt() {
        switch (this.width) {
            case 1:
                return this.view.getInt8();
            case 2:
                return this.view.getInt16(0, endian);
            case 4:
                return this.view.getInt32(0, endian);
            case 8:
                return this.view.getBigInt64(0, endian);
            default:
                return 0;
        }
    }

    readFloat() {
        switch (this.width) {
            case 4:
                // float (THIS WILL NEVER HAPPEN FOR PRINTF)
                return this.view.getFloat32(0, endian);
            case 8:
                // double
                return this.view.getFloat64(0, endian);
            case 16:
                return 0;
        }
    }

    readValue() {
        if (this.address) {
            switch (this.type) {
                // string
                case 's': {
                    if (this.width == 1) {
                        return getStr(this.view.getUint32(0, endian));
                    } else {
                        return getWideStr(this.view.getUint32(0, endian));
                    }
                }

                // char is unsigned int
                case 'c':
                    return String.fromCharCode(this.readUint());

                // floats
                case 'e': // exponential
                case 'f': // fixed
                case 'g': // precision
                    return this.readFloat();

                // pointer (hex)
                case 'p':
                    return (this.view.getUint32(0, endian));

                // signed ints
                case 'd':
                case 'i':
                    return this.readInt();

                // unsigned ints
                case 'o':
                case 'x':
                case 'X':
                case 'u':
                    return this.readUint();
            }
        } else {
            return 0;
        }
    }
}

const SIGNS = "+-";
const SEP = ",";
const OCT_DIG = "01234567";
const DEC_DIG = "0123456789";
const HEX_DIG_LOW = "abcdef";
const HEX_DIG_UP = "ABCDEF";

const BASE_DIGITS = {
    8: OCT_DIG,
    10: DEC_DIG,
    16: DEC_DIG + HEX_DIG_UP + HEX_DIG_LOW
}

/**
 * Parse a number from a stream with specific parameters
 * @param {FileHandle} handle The file handle to read from
 * @param {String} base The base to read. "i" or undefined is any base, "o" is octal, "d" is 10, and "x" or "X" are hexadecimal
 * @param {boolean} unsigned Whether to treat the number as unsigned, default false
 * @param {String} sep The thousands separator character to use, or undefined for none
 * @param {boolean} frac Whether to parse as a floating point number
 * @param {number} maxlen The maximum number of chars to read
 * @returns a tuple containing the parsed number value (or null), and the total number of characters read
 */
async function streamParseNumber(handle, base, unsigned, sep, frac, maxlen) {
    // 0: whitespace
    // 1: sign
    // 2: prefix
    // 3: number
    // 4: decimal separator
    // 5: number (fractional part)
    // 6: exp separator (e/E)
    // 7: sign
    // 8: number (exponent)
    let state = 0;

    // chars read... always going to be the same as the found length?
    let offset = 0;
    // whitespcae skipped
    let whitespace = 0;

    // buffer for the parsed input
    let prefix = "";

    // buffer the parsed string -- concatenating to a string is the fastest way to do this apparently
    let found = "";
    let ignored = 0;

    let baseNum = 0;
    let totalRead = 0;

    let c = -1;
    while (-1 != (c = await jsFgetc(handle))) {
        totalRead++;

        // 0: Whitespace
        if (state === 0 && isspace(c)) {
            // ignore whitespace
            whitespace++;
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
            if (base === "d") {
                // no prefix for decimal. continue immediately.
                baseNum = 10;
                state++;
            } else {
                // all the other things. no prefix,
                if (prefix.length === 0 && strChar === "0") {
                    prefix += strChar;
                    if (base === "o") {
                        // octal just has 0 prefix, so continue immediately
                        baseNum = 8;
                        state++;
                    }

                    // next char
                    continue;
                } else if (prefix.length === 1 && (strChar === "x" || strChar === "X")) {
                    prefix += strChar;
                    base = "x";
                    baseNum = 16;
                    state++;
                    // next char
                    continue;
                } else {
                    // non-matched char, end of prefix
                    if (prefix === "0") {
                        base = "o";
                        baseNum = 8;
                    } else if (!prefix && (!base || base === "i")) {
                        base = "d";
                        baseNum = 10;
                    }
                    // character is still unhandled, so go to the next state with this char (no continue)
                    state++;
                }
            }
        }

        // 3: Number
        if (state === 3) {
            const digits = BASE_DIGITS[baseNum] ?? DEC_DIG;
            if (digits.includes(strChar)) {
                found += strChar;
                continue;
            } else if (sep && sep.includes(strChar)) {
                ignored++;
                continue;
            } else {
                // unmatched char, keep trying to handle
                state++;
            }
        }

        // 4: Decimal separator
        if (state === 4) {
            if (frac) {
                if (strChar === ".") {
                    found += strChar;
                    state++;
                    continue;
                } else {
                    // skip fractional portion if there's no separator
                    // (but there could still be exponent)
                    state += 2;
                }
            } else {
                // done! this is an int, don't do any fractional parsing
                // set state to 0 so we skip the rest of the loop until the end
                state = 0;
            }
        }

        // 5: Number (fractional part)
        if (state === 5) {
            // at this point everything will be decimals
            // no way i'm going to handle hex floats, that's just weird???
            if (DEC_DIG.includes(strChar)) {
                found += strChar;
                continue;
            } else {
                state++;
            }
        }

        // 6: exponent separator
        if (state === 6) {
            if (strChar === "e" || strChar === "E") {
                found += strChar;
                state++;
                continue;
            } else {
                state++;
            }
        }

        // 7: exponent sign
        if (state === 7) {
            if (strChar === '+' || strChar === '-') {
                found += strChar;
                state++;
                continue;
            } else {
                state++;
            }
        }

        // 8: Numbe (exponent)
        if (state === 8) {
            // another number, for the exponent
            if (DEC_DIG.includes(strChar)) {
                found += strChar;
                continue;
            } else {
                state++;
            }
        }

        // put last char back as it was not used
        totalRead--;
        handle.ungetchar(c);
        break;
    }

    if (found) {
        try {
            if (frac) {
                console.warn("Will parse %s as a float, read %s chars", found, totalRead);
                return [ parseFloat(found), totalRead ];
            } else {
                console.warn("Will parse %s as a base %s number, read %s chars", found, baseNum ?? "any", totalRead);
                return [ parseInt(found, baseNum), totalRead ];
            }
        } catch (err) {
            return [ null, totalRead ];
        }
    } else {
        return [ null, totalRead ];
    }
}

function parseCharacterSet(set) {
    const exclude = set.startsWith("^");
    if (exclude) {
        // chop off the '^'
        set = set.substring(1);
    }

    let result = "";

    let lastChar = null;
    for (let char of set) {
        if (lastChar === '-') {
            if (!result) {
                // this is undefined behavior so I'm allowed to log stuff
                console.warn("Bad character set format %s, put '-' at the end if you want to include it, not at the start", set);
                // add the literal dash
                result += lastChar;
                // and add this char as a regular char
                result += char;
            } else {
                // add all the intervening chars, e.g. for a-f, this takes care of adding b, c, d, e, and f
                for (let i = result.charCodeAt(result.length - 1) + 1; i <= char.charCodeAt(0); i++) {
                    result += String.fromCharCode(i);
                }
            }
        } else if (char !== '-') {
            // just include all characters other than dash into the string
            result += char;
        }

        // always update lastChar, including for '-'
        lastChar = char;
    }

    // If '-' was the last character in the set, add it as a literal
    if (lastChar === '-') {
        result += '-';
    }

    return {set: result, exclude: exclude};
}

class ScanArg {
    constructor(varargs, argIndex, match, argnum, apostropheOrStar, malloc, maxlen, len, conv, group) {
        this.assign = (!apostropheOrStar || !apostropheOrStar.includes("*"))
                       && (match != '%%');

        // whether to allow thousands separators in decimals
        this.sep = (apostropheOrStar && apostropheOrStar.includes("'"));
        this.malloc = (malloc == "m");
        this.maxlen = maxlen ? parseInt(maxlen) : 0;

        if (this.assign && varargs) {
            const addr = getPtrAligned(varargs, 4).getUint32(4 * argIndex, endian);
            this.view = getMemView(addr);

            // check if we're using %n$ format and arrange the args

            let width = 4;
            let memberWidth = 0;

            switch (conv) {
                case 's': memberWidth = 1; break; // string
                case 'c': {
                    // chars, no terminating null,
                    memberWidth = 1;
                    if (maxlen === 0) {
                        maxlen = 1;
                    }
                    break;
                }
                case 'p': break; // void pointer
            }

            switch (len) {
                case 'hh': width = 1; break; // char aka i8/u8
                case 'h':  width = 2; break; // short aka i16/u16
                case 'l':  {
                    if (conv == 'c' || conv == 's') {
                        memberWidth = 2;
                    } else if ("Eaefg".includes(conv)) {
                        width = 8;
                    } else {
                        width = 4;
                    }

                    break;
                }
                case 'll': width = 8; break;
            }

            this.width = width;
            this.memberWidth = memberWidth;
            this.conv = conv;
            this.group = group;
        }
    }

    /**
     *
     * @param {FileHandle} handle The file handle to read from
     * @param {Number} offset The offset within the fscanf call of the handle pointer (chars read so far)
     */
    async read(handle, offset) {
        // contains so-far read string
        let str = "";
        let value = null;
        let count = 0;

        let readType;
        let addNul = true;

        switch (this.conv.charAt(0)) {
            case '%': {
                // read literal '%'
                if (await jsFgetc(handle) == '%') {
                    count = 1;
                } else {
                    count = 0;
                }

                readType = "literal";
                break;
            }

            case 'd': {
                // parse decimal number: [+-]?[0-9]+
                // note, take sep into account
                [value, count] = await streamParseNumber(handle, "d", false, (this.sep ? ',' : null), false, this.maxlen);
                readType = "int";
                break;
            }
            case 'i': {
                // parse any base: ([+-]?([0-9]+|0x[0-9a-z]+|0X[0-9A-Z]+|0[0-7]+))
                [value, count] = await streamParseNumber(handle, undefined, false, (this.sep ? ',' : null), false, this.maxlen);
                readType = "int";
                break;
            }

            case 'o': {
                // parse octal number: [+-]?[0-7]+
                [value, count] = await streamParseNumber(handle, "o", false, null, false, this.maxlen);
                readType = "uint";
                break;
            }

            case 'u': {
                // parse unsigned decimal: [+]?[0-9]+
                // note, take sep into account
                [value, count] = await streamParseNumber(handle, "d", true, (this.sep ? ',' : null), false, this.maxlen);
                readType = "uint";
                break;
            }

            case 'x':
            case 'X':
            case 'p': {
                // parse hex number: [+]?(0x)?[0-9A-Fa-f]+
                // ( or parse pointer: 0x[0-9a-f]+
                [value, count] = await streamParseNumber(handle, "x", true, null, false, this.maxlen);
                readType = "uint";
                break;
            }

            case 'E':
            case 'a':
            case 'e':
            case 'f':
            case 'g': {
                // parse float number: [+-]?([0-9]+)?
                // note, take sep into account
                [value, count] = await streamParseNumber(handle, undefined, false, (this.sep ? ',' : null), true, this.maxlen);
                readType = "float";
                break;
            }

            case 's': {
                // parse string, write with NUL byte
                // read up to whitespace or maxlength
                let c;
                while ((!this.maxlen || str.length < this.maxlen) && -1 != (c = await jsFgetc(handle))) {
                    if (isspace(c)) {
                        handle.ungetchar(c);
                        break;
                    }
                    str += String.fromCharCode(c);
                }
                count = str.length;
                value = str;
                readType = "string";
                break;
            }

            case 'c': {
                // parse string, write without NUL byte
                // read up to maxlength
                let c;
                while (str.length < this.maxlen && -1 != (c = await jsFgetc(handle))) {
                    str += String.fromCharCode(c);
                }
                count = str.length;
                value = str;
                readType = "string";
                addNul = false;
                break;
            }

            case '[': {
                // parse custom set of characters, in format
                const {set, exclude} = parseCharacterSet(this.group);

                let c;
                while ((!this.maxlen || str.length < this.maxlen) && -1 != (c = await jsFgetc(handle))) {
                    if (Boolean(set.includes(c)) != Boolean(exclude)) {
                        // set includes and exclude=false, or:
                        // set does not include and exclude=true
                        // so either way, continue on
                        str += String.fromCharCode(c);
                    } else {
                        // no match, put the char back
                        handle.ungetchar(c);
                        break;
                    }

                }
                value = str;
                count = str.length;
                readType = "string";
                break;
            }

            case 'n': {
                value = (offset | 0);
                count = 0;
                readType = "uint"
                break;
            }
        }

        if (this.assign) {
            if (readType === "string") {
                const buflen = str.length + (addNul ? 1 : 0);

                if (buflen > 0) {
                    let buf = null;
                    if (this.malloc) {
                        let addr = malloc(buflen);
                        buf = getArrUint8(addr, buflen);
                        this.view.setUint32(0, addr|0, endian);
                    } else {
                        buf = getArrUint8(this.view.byteOffset, this.view.byteLength);
                    }

                    writeStr(buf, str);
                    if (addNul) {
                        buf[str.length] = 0;
                    }
                }
            } else if (readType === "int") {
                switch (this.width) {
                    case 1: this.view.setInt8(0, value); break;
                    case 2: this.view.setInt16(0, value, endian); break;
                    case 4: this.view.setInt32(0, value, endian); break;
                    case 8: this.view.setBigInt64(0, value, endian); break;
                }
            } else if (readType === "uint") {
                switch (this.width) {
                    case 1: this.view.setUint8(0, value); break;
                    case 2: this.view.setUint16(0, value, endian); break;
                    case 4: this.view.setUint32(0, value, endian); break;
                    case 8: this.view.setBigUint64(0, value, endian); break;
                }
            } else if (readType === "float") {
                switch (this.width) {
                    case 4: this.view.setFloat32(0, value, endian); break;
                    case 8: this.view.setFloat64(0, value, endian); break;
                }
            }

            return [value, count];
        } else {
            return [undefined, count];
        }
    }
}

// The mode portion of an fopen() call, e.g. "r" or "a+" or "wb+"
class FileMode {
    #read;
    #write;

    #readPos;
    #writePos;

    #create;
    #truncate;
    #binary;

    constructor(modeStr) {
        let read = false;
        let readPos = 0;

        let write = false;
        let writePos = 0;

        let mainMode = null;

        let create = false;
        let trunc = false;

        let binary = false;

        for (const char of Object.values(modeStr)) {
            switch (char) {
                case 'a':
                    // append
                    mainMode = 'a';
                    // write at the end aka -1

                    write = true;
                    writePos = -1;

                    create = true;
                    break;

                case 'b':
                    binary = true;
                    break;

                case 'r':
                    // read-only
                    mainMode = 'r';

                    read = true;
                    readPos = 0;
                    break;

                case 'w':
                    // write-only
                    mainMode = 'w';

                    write = true;
                    writePos = 0;

                    create = true;
                    trunc = true;
                    break;

                case '+':
                    switch (mainMode) {
                        case 'r':
                            write = true;
                            writePos = 0;
                            break;

                        case 'w':
                            read = true;
                            readPos = 0;
                            break;

                        case 'a':
                            read = true;
                            readPos = 0;
                            break;
                    }
                    break;
            }
        }

        this.#read = read;
        this.#write = write;
        this.#readPos = readPos;
        this.#writePos = writePos;
        this.#create = create;
        this.#truncate = trunc;
        this.#binary = binary;
    }

    get read() {
        return this.#read;
    }

    get write() {
        return this.#write;
    }

    get readPos() {
        return this.#readPos;
    }

    get writePos() {
        return this.#writePos;
    }

    get create() {
        return this.#create;
    }

    get truncate() {
        return this.#truncate;
    }

    get binary() {
        return this.#binary;
    }

    // Check if this mode is compatible with the given fs read/write capabilities
    isCompatible(canRead, canWrite) {
        return (!this.read || canRead) && (!this.write || canWrite);
    }
}

// Result of a stat call
class Stat {
    constructor(type, size) {
        // dir, file, ... special? idk
        this.type = type;

        // -1 for unknown?
        this.size = size;
    }
}

// Represents the file handle
class FileHandle {
    #reader = null;
    #writer = null;
    #eof = false;
    #err = null;
    #ungot = [];

    constructor(readStream, writeStream, mode) {
        this.readStream = readStream ? readStream : null;
        this.writeStream = writeStream ? writeStream : null;
        this.readPos = mode.readPos;
        this.writePos = mode.writePos;
        this.create = mode.create;
        this.truncate = mode.truncate;
    }

    get reader() {
        if (!this.#reader) {
            this.#reader = this.readStream.getReader({mode: "byob"});
        }

        return this.#reader;
    }

    get writer() {
        if (!this.#writer) {
            this.#writer = this.writeStream.getWriter();
        }

        return this.#writer;
    }

    get eof() {
        return this.#eof;
    }

    set eof(val) {
        this.#eof = !!val;
    }

    get err() {
        return this.#err;
    }

    set err(val) {
        this.#err = val;
    }

    /**
     *
     * @returns A char that was most recently ungot, if any, or null. Does not interact with the stream,
     * so if this returns null you should grab a character.
     */
    getchar() {
        if (this.#ungot) {
            return this.#ungot.pop();
        } else {
            return null;
        }
    }

    ungetchar(c) {
        if (typeof c == "number") {
            this.#ungot.push(c);
        } else if (typeof c == "string") {
            this.#ungot.push(c.charCodeAt(0));
        } else {
            throw new TypeError("ungetchar() requires number or string, not '" + typeof c + "'");
        }
    }

    resetGetchar() {
        this.#ungot.length = 0;
    }
}

// The base needed to implement a simple fs
class JsFs {
    constructor(base, flags) {
        this.base = base ? base : "";
        this.flags = flags;
        this.read = (!flags || (flags.includes("ro") || flags.includes("rw")));
        this.write = (flags && (flags.includes("wo") || flags.includes("rw")));
    }

    // return a promise for basic info about a file or dir listing
    stat(path) { return new Promise(() => { return new Stat(null, 0); }); }
    // return a promise for a file with read/write streams, as applicable
    open(path, mode) { return new Promise(() => { return null; }); }
    // return a directory listing
    list(path) { return new Promise(() => { return []; }); }
    // delete a file
    remove(path) { return new Promise(() => { return false; }); }
}

class LocalStorageFs extends JsFs {
    constructor(base, flags) {
        super(base, flags);
    }

    #getReadStream(path) {
        return new ReadableStream({
            type: "bytes",
            start(controller) {
                const item = localStorage.getItem(path);
                if (item === null)
                {
                    return;
                } else {
                    const encoded = new Uint8Array(item.length);
                    writeStr(encoded, item);
                    controller.enqueue(encoded);
                    return;
                }
            }
        });
    }

    #getWriteStream(path) {
        return function(path){
            // idk make up a byte length
            // resizable arraybuffer support is experimental in like, just firefox...
            const supportsResize = ("undefined" != (new ArrayBuffer(2, {maxByteLength: 4}).resizable));
            const buf = new ArrayBuffer(supportsResize ? 32768 : 8, {maxByteLength: 32768});
            const bview = new DataView(buf);
            let offset = 0;
            return new WritableStream({
                write(chunk) {
                    return new Promise((resolve, reject) => {
                        // chunk should be a Uint8Array
                        if (offset + chunk.byteLength > buf.byteLength) {
                            console.debug("Resizing buffer to size %s", offset + chunk.byteLength);
                            buf.resize(offset + chunk.byteLength);
                        }

                        // do an awful slow thing
                        for (let i = 0; i < chunk.byteLength; i++) {
                            bview.setUint8(offset + i, chunk[i]);
                        }

                        offset += chunk.byteLength;
                        resolve();
                    });
                },
                close() {
                    // Actually write the item
                    console.debug("Writing %s bytes to localStorage@%s", offset, path);
                    localStorage.setItem(path, utf8Decoder.decode(new Uint8Array(buf, 0, offset|0)));
                },
                abort(err) {
                    console.error("Stream error", err);
                }
            });
        }(path);
    }

    stat(path) {
        return new Promise((resolve, reject) => {
            let item;
            if ((item = localStorage.getItem(path)) !== null) {
                // item exists
                resolve(new Stat("file", item.length));
            } else {
                // item doesn't exist, but maybe it does as a dir...
                for (const i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith(path)) {
                        resolve(new Stat("dir", 0));
                    }
                }

                resolve(null);
            }
        });
    }

    open(path, mode) {
        console.debug("localStorage.open(%o, %o)", path, mode);
        return new Promise((resolve, reject) => {
            let item = localStorage.getItem(path);
            if (item !== null || (mode.write && mode.create)) {
                const readStream = mode.read ? this.#getReadStream(path) : null;
                const writeStream = mode.write ? this.#getWriteStream(path) : null;

                resolve(new FileHandle(readStream, writeStream, mode));
            } else {
                resolve(null);
            }
        });
    }

    list(path) {
        return new Promise((resolve, reject) => {
            const result = [];
            let anyFound = false;
            for (const i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key == path) {
                    // for the exact match, don't list it...
                    // but we should still successfully return an empty list
                    anyFound = true;
                } else if (key.startsWith(path)) {
                    anyFound = true;
                    const lastSlash = key.indexOf("/", path.length);
                    const trimmed = key.substring(path.length, (lastSlash === -1) ? undefined : lastSlash);
                    console.debug("%s + %s --> %s", key, path, trimmed);

                    if (!result.includes(trimmed)) {
                        result.push(trimmed);
                    }
                }
            }

            resolve(anyFound ? result : null);
        });
    }

    remove(path) {
        return new Promise((resolve, reject) => {
            if (localStorage.includes(path)) {
                localStorage.removeItem(path);
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }
}

class HttpJsFs extends JsFs {
    constructor(base, flags) {
        super(base, flags);
    }

    stat(path) {
        return fetch(path, { method: HEAD }).then((response) => {
            if (response.ok) {
                return new Stat("file", response.headers.get("content-length"));
            } else {
                return null;
            }
        });
    }

    open(path, mode) {
        if (mode.write) {
            console.warn("HTTP fs module doesn't support writing (yet?)");
        }

        return fetch(path).then((response) => {
            if (response.ok) {
                return new FileHandle(wrapReadable(response.body.getReader()), null, mode);
            } else {
                return null;
            }
        });
    }

    list(path) {
        return fetch(path).then((response) => {
            if (response.ok) {
                return response.text;
            } else {
                return null;
            }
        }).then((text) => {
            if (text) {
                const entries = [];
                const parser = new DOMParser();
                const doc = parser.parseFromString(text);

                doc.querySelectorAll("a[href]").forEach((link) => {
                    const href = link.getAttribute("href");
                    if (href.match(/\//g).length < 2) {
                        // less than 2 slashes, we're probably good to include it
                        entries.push(href);
                    }
                });

                return entries;
            } else {
                return null;
            }
        });
    }

    remove(path) {
        // unsupported?
        return Promise.resolve(false);
    }
}

function getStringReadStream(str) {
    if (typeof str != "number" && typeof str != "string") {
        throw new TypeError("getStringReadStream() requires either a number (pointer) or string, not '" + typeof str + "'");
    }

    const jsStr = (typeof str == "number") ? getStr(str) : str;

    return new ReadableStream({
        type: "bytes",
        start(controller) {
            if (jsStr.length > 0) {
                const encoded = new Uint8Array(jsStr.length);
                writeStr(encoded, jsStr);
                controller.enqueue(encoded);
            }
            controller.close();
        }
    });
}

// all open files
const FILES = [];

// file versions of stdin/stdout/stderr
let stdinFile = null;
let stdoutFile = null;
let stderrFile = null;

// The next value we will return for an fopen() call
let curFd = 0;

let fsConfig = {};

// the JS instances, indexed by file descriptor
const fsInstances = {};

// A real wasm memory buffer
let internalBuffer;

const formatRegex = /%(-)?(0?[0-9]+)?([.][0-9]+)?([#][0-9]+)?(L|z|ll?|hh?)?([scfgpexdiu%])/g;

function registerFile(handle) {
    console.debug("Registered file %o to fd=%o", handle, curFd);
    FILES[curFd] = handle;
    return curFd++;
}

function unregisterFile(fd) {
    FILES[fd] = undefined;
}

function normalizePath(path) {
    // TODO something better
    if (path.charAt(0) != '/') {
        return '/' + path;
    }

    return path;
}

function initFilesystems(fsConfs) {
    for (const [pattern, configs] of Object.entries(fsConfs)) {
        fsInstances[pattern] = [];
        for (const [index, config] of configs.entries()) {
            let fs;
            switch (config.type) {
                case 'localstorage': {
                    fs = new LocalStorageFs(config.base ? config.base : "/", config.flags);
                    break;
                }

                case 'http': {
                    fs = new HttpJsFs(config.base ? config.base : "/", config.flags);
                    break;
                }

                case 'download': {
                    fs = null;
                    break;
                }
            }

            fsInstances[pattern].push(fs);
        }
    }

    console.debug("fsInstances", fsInstances);
}

// Find the appropriate filesystem for the path+mode
function getFilesystems(path, mode) {
    // MODES:
    // r: read, from the start
    // r+: read+write, from the start
    // w: write, truncate/create, at the start
    // w+: read+write, truncate/create, at the start
    // a: write, create, at the end
    // a+: read+write, create, read at the start, write at the end
    // note read start position in a+ is implementation-specific

    const npath = normalizePath(path);

    const result = [];

    console.debug("Finding filesystem for path '%s' (norm='%s') and mode %o", path, npath, mode);
    for (const [pattern, configs] of Object.entries(fsConfig)) {
        const re = new RegExp(pattern);
        console.debug("Checking %s configured file backends for %s (%o)", configs.length, pattern, Object.entries(fsConfig));

        for (const [index, config] of configs.entries()) {
            console.debug("config", config);

            if (config.flags) {
                console.debug("flags: ro=%s, rw=%s, wo=%s", (!config.flags || "ro" in config.flags), ("rw" in config.flags), ("wo" in config.flags));
            }

            // readable by default
            const fsReadable = (!config.flags || config.flags.includes("ro") || config.flags.includes("rw"));
            // non-writable by defaultg
            const fsWritable = (config.flags && (config.flags.includes("wo") || (config.flags.includes("rw"))));

            const match = npath.match(re);
            if (match) {
                console.debug("It matched!", match);
                // Now check the read/write compatibility

                if (mode.isCompatible(fsReadable, fsWritable)) {
                    console.debug("And the modes are compatible!");

                    const subpath = /*(config.base)
                                    ? npath.replace(pattern, config.base)
                                    :*/ npath;
                    result.push({fs: fsInstances[pattern][index], path: subpath});
                } else {
                    console.debug("Incompatible modes, fs(read=%s, write=%s) and mode(read=%s, write=%s)",
                                fsReadable, fsWritable, mode.read, mode.write);
                }
            }
        }
    }

    return result;
}

export async function fopen(pathname, mode) {
    return await
        // parse the path
        // look up the filesystem config for that path (make a function for that)
        new Promise((resolve, reject) => {
            console.debug("fopen(%s, %s)", getStr(pathname), getStr(mode));
            const parsedMode = new FileMode(getStr(mode));
            const pathStr = getStr(pathname);

            console.debug("fopen(%s, %o)", pathStr, parsedMode);
            const filesystems = getFilesystems(pathStr, parsedMode);
            console.debug(filesystems);


            const search = [...filesystems.values()];
            console.debug("search=%o", search);
            const promises = search.map((val) => {
                console.debug("val=%o\n", val);
                if (val.fs) {
                    let promise = val.fs.open(val.path, parsedMode);
                    console.debug("promise=%o", promise);
                    return promise;
                } else {
                    return Promise.resolve();
                }
                //return val.fs ? val.fs.open(val.path) : Promise.resolve();
            });

            Promise.all(promises).then((results) => {
                let out = null;
                console.debug("Got all results %o", results);
                for (let i = 0; i < results.length; i++) {
                    if (results[i]) {
                        out = results[i];
                        console.debug("found %o in loop", out);
                        break;
                    } else {
                        console.debug("results[%o] is false?? %o", i, results[i]);
                    }
                }

                if (out) {
                    console.debug("found %o", out);
                    resolve(registerFile(out));
                } else {
                    console.debug("didn't find")
                    resolve(0);
                }
            });
        });
}

export function fclose(stream) {
    const handle = FILES[stream];

    if (handle) {
        if (handle.readStream) {
            console.debug("closing readStream? %o", handle.readStream);
            if (handle.readStream.locked) {
                console.debug("not closing bc it's locked!");
            } else {
                console.debug("cancel=%o", handle.readStream.cancel());
            }
        }

        if (handle.writeStream) {
            console.debug("closing writeStream? %o", handle.writeStream);
            if (handle.writeStream.locked) {
                handle.writer.close().then((x) => {
                    console.debug("x: %o", x);
                }).catch((err) => { console.error("writeStream.close(): %o", err);});
            } else {
                handle.writeStream.close().then(() => {
                    console.debug("Closed! in the background...");
                });
            }
        }

        unregisterFile(stream);
    }

    return 0;
}

export function fseek(stream, offset, whence) {
    // TODO
}

export function ftell(stream) {
    // TODO
}

export function rewind(stream) {
    // TODO can't exactly rewind streams so we should just remake the stream
    // so, a file handle needs a way to do that as we have no way of knowing where it came from here (nor should we need to know!)
}

export async function fflush(stream) {
    return 0;
}

export function access(pathname, mode) {
    return 0;
}

export function remove(pathname) {
    return 0;
}

export function feof(stream) {
    const handle = FILES[stream];
    if (handle) {
        return handle.eof;
    }

    return 0;
}

export function ferror(stream) {
    const handle = FILES[stream];
    if (handle) {
        return !!handle.err;
    }

    return 0;
}

export function clearerr(stream) {
    const handle = FILES[stream];

    if (handle) {
        handle.err = null;
    }
}

// Wrap a readable stream in a stream that supports BYOB reads
// we need this for variable sized reads, as fread uses
function wrapReadable(read) {
    return function(r) {
        return new ReadableStream({
            type: "bytes",
            start(controller) {
                function push() {
                    r.read().then(({ done, value }) => {
                        if (value) {
                            controller.enqueue(value);
                        }

                        if (done) {
                            controller.close();
                        } else {
                            push();
                        }
                    });
                }

                push();
            },
        });
    }(read);
}

export async function fread(ptr, size, nmemb, stream) {
    const handle = FILES[stream];

    if (handle) {
        //const view = getMemView(ptr, size * nmemb);
        //const view = getArrUint8(ptr, size * nmemb);
        const readLen = size * nmemb|0;
        // number of bytes already written out to the caller's buf
        // (if we repeat the fetch in the middle of the read)
        let queued = 0;
        let freadLen = 0;

        return await new Promise((resolve, reject) => {
        //function fetchMore() {
            const buf = new ArrayBuffer(readLen);
            const view = new DataView(buf, 0, readLen-queued);

            handle.reader.read(view).then(({ done, value }) => {
                let thisRead = 0;

                if (value) {
                    thisRead = value.byteLength;
                    //hexdump(view.byteOffset, view.byteLength);
                    freadLen += thisRead;
                    handle.readPos += thisRead;

                    const outBuf = getArrUint8(ptr + queued, thisRead);
                    for (let i = 0; i < value.byteLength; i++) {
                        outBuf[i] = value.getUint8(i);
                    }
                }

                if (freadLen < readLen) {
                    queued += thisRead;

                    // Don't resume, keep fetching until we get all we can or the stream closes
                    if (!done) {
                        handle.reader.closed.then(() => {
                            handle.eof = true;
                            console.debug("locked?????", handle.reader.locked);
                            resolve(freadLen);
                        }).catch((err) => {
                            console.error("err on reader.closed()! %o", err);
                            resolve(freadLen);
                        });
                    } else {
                        console.debug("Unexpectedly done???");
                        handle.eof = true;
                        resolve(freadLen);
                    }
                } else {
                    // we're done or got all the things, return!
                    resolve(freadLen);
                }

            }).catch((err) => {
                console.error("err: %o", err);
                // todo error codes
                handle.err = 1;

                resolve(0);
            });
        });
    } else {
        return await Promise.resolve(-1);
    }
}

export async function fwrite(ptr, size, nmemb, stream) {
    const handle = FILES[stream];

    if (handle && handle.writeStream) {
        const arr = getArrUint8(ptr, (size * nmemb));

        return await handle.writer.write(arr).then((res) => {
            console.debug("written, res => %o", res);

            let written = (size * nmemb);
            handle.writePos += written;
            return written;
        }).catch((err) => {
            console.error("Write error: %o", err);
            return -1;
        });
    } else {
        return await Promise.resolve(-1);
    }
}

function getFormatArgs(fmt, varargs, literals) {
    const str = ((typeof fmt) == "number") ? getStr(fmt) : fmt;

    // This will hold type info about the C arguments and their pointers
    const cArgs = [];

    if (varargs != 0) {
        // pointer to the current argument
        let curPtr = varargs;

        // I've solved the mystery of how %f and %lf both work for either float and double, which are different sizes
        // Apparently the C spec (6.5.2.2/6) says that floats in varargs get auto-promoted to doubles! Wild.

        // ok not ideal but the easiest way to do this is going to be in two passes
        // first to figure out expected types for the args
        // next to actually do the conversion and printing
        function sizesCallback(match, sign, pad, precision, base, len, conv) {
            // Ignore '%%' as that's just a literal
            if (match=='%%') return;

            // by default, everything's an int
            let width = 4;
            // basically for wchars?
            let memberWidth = 0;

            switch (conv) {
                case 's': memberWidth = 1; break;
                case 'e':
                case 'f':
                case 'g': width = 8; break;
                // the rest are all ints (4) when there's no length modifier
            }

            switch (len) {
                // no length specifier given, use the
                case 'hh': width = 1;  break; // char aka i8/u8
                case 'h':  width = 2;  break; // short aka i16/u16
                case 'l': {
                    // print wchar_t (%lc) or string of wchar_t (%ls)
                    if (conv == 'c') {
                        width = 2;
                    }
                    else if (conv == 's') {
                        memberWidth = 2;
                    }
                    // print long for %d, %i, %p, %x, etc.
                    else width = 4;
                    break; // long aka i32/u32, for ints, or wchar_t for %c ()
                }
                case 'll': width = 8;  break; // long long aka i64/u64
                case 'L':  width = 16; break; // long double aka f128 aka two f64s aka who cares
                case 'j':  width = 8;  break; // intmax_t/uintmax_t aka i64/u64
                case 'z':  width = 8;  break; // size_t/ssize_t aka u64/i64(?)
                case 't':  width = 8;  break; // ptrdiff_t aka i64?
            }

            // Get the next appropriately-aligned value
            let data = getPtrAligned(curPtr, width);

            // set the width to memberWidth if present, but otherwise still use width to advance the pointer
            // (the ArgInfo doesn't care about the pointer width, just the data width)
            cArgs.push(new ArgInfo(conv, (memberWidth ? memberWidth : width), data));

            // We can't just do `curPtr += width` because of alignment
            curPtr = data.byteOffset + width;
        }

        let literalStart = 0;
        formatRegex.lastIndex = 0;
        for (const [i, element] of [...str.matchAll(formatRegex)].entries()) {
            sizesCallback(...element);
            if (typeof literals != "undefined") {
                console.log("i: %d, lastIndex: %d", i, formatRegex.lastIndex);
            }
        }
    }

    return cArgs;
}

function processScanLiteral(regions, str, start) {
    const wsRegex = /[\s\n\t ]+/g;

    let arr = null;

    let literalStart = 0;
    while ((arr = wsRegex.exec(str)) != null) {
        let wholeMatch = arr[0];
        let matchStart = wsRegex.lastIndex - wholeMatch.length;
        if (matchStart > literalStart) {
            regions.push({ type: "literal", start: start + literalStart, length: matchStart - literalStart, str: str.substring(literalStart, matchStart)});
        }
        literalStart = wsRegex.lastIndex;

        regions.push({ type: "whitespace", start: start + matchStart, length: wholeMatch.length });
    }

    return regions;
}

function getScanArgs(fmt, varargs) {
    // argnum, apostropheOrStar, malloc, length, width, conversion
    const scanRegex = /%(?:([0-9]+)\$)?(\*'|'\*|'|\*|)?(m?)([0-9]+)?(L|z|ll?|hh?)?([scfgpeExXodiun%]|\[(\^?\]?[^\]]*)\])/g;
    const str = ((typeof fmt) == "number") ? getStr(fmt) : fmt;

    const regions = [];
    let matchIndex = 0;
    let arr = null;

    let literalStart = 0;
    while ((arr = scanRegex.exec(str)) != null) {
        let wholeMatch = arr[0];
        let matchStart = scanRegex.lastIndex - wholeMatch.length;
        if (matchStart > literalStart || literalStart > 0) {
            // Handle any literals and whitespace between the formats
            processScanLiteral(regions, str.substring(literalStart, matchStart), literalStart);
        }

        literalStart = scanRegex.lastIndex;

        // argnum, apostropheOrStar, malloc, length, width, conversion
        // ok turns out it's real simple to handle varargs here out of order, because they're all pointers

        const arg = new ScanArg(varargs, matchIndex, ...arr);
        regions.push({ type: "match", start: matchStart, length: wholeMatch.length, arg: arg });

        if (arg.assign) {
            matchIndex++;
        }
    }

    if (regions.length > 0) {
        // Handle any trailing literals/whitespace
        let lastRegion = regions[regions.length-1];
        if (lastRegion.type === "match" && (lastRegion.start + lastRegion.length) < str.length) {
            processScanLiteral(regions, str.substring(lastRegion.start + lastRegion.length), lastRegion.start + lastRegion.length);
        }
    } else {
        // Handle when the string is all literals
        processScanLiteral(regions, str, 0);
    }

    return regions;
}

// TODO / Not Yet Supported:
// - %2$s format
// - %n
// - %25s string lengthing
// - %*s style pointers
// this means random code might fail if sprintf isn't working as expected
function jsSprintf(cStr, varargs) {
    const str = getStr(cStr);

    // This will hold type info about the C arguments and their pointers
    const cArgs = getFormatArgs(str, varargs);

    let i = 0;
    function replCallback(match, sign, pad, precision, base, len, conv) {
        // Replace '%%' with a literal '%'
		if (match=='%%') return '%';

        // TODO don't do this?
		precision  = precision ? parseInt(precision.substr(1)) : undefined;
		base = base ? parseInt(base.substr(1)) : undefined;
        len = len ? len : '';
        const info = cArgs[i++];
        const arg = info.readValue();

        let val;
		switch (conv) {
            // str
			case 's': val = arg; break;
			case 'c': val = arg; break;
            // float -- decimal places
			case 'f': val = parseFloat(arg).toFixed(precision ? precision : 6); break;
            // float -- precision
            case 'g': val = parseFloat(arg).toPrecision(precision ? precision : 6); break;
            // pointer (hex)
			case 'p': val = parseInt(arg).toString(16); break;
            // exponential notation
			case 'e': val = parseFloat(arg).toExponential(precision ? precision : 6); break;
			case 'x': val = parseInt(arg).toString(16); break;
			case 'X': val = parseInt(arg).toString(16).toUpperCase(); break;
			case 'd': val = parseInt(arg).toString(10); break;
            case 'i': val = parseInt(arg).toString(base?base:10); break;
            case 'u': val = parseFloat(parseInt(arg, base?base:10).toPrecision(precision)).toFixed(0); break;
		}

		val = val.toString(base);
		var sz = parseInt(pad); /* padding size */
		var ch = pad && pad[0]=='0' ? '0' : ' '; /* isnull? */
        // sign determines which side the padding is on
		while (val.length<sz) val = sign !== undefined ? val+ch : ch+val; /* isminus? */
	   return val;
	}

    formatRegex.lastIndex = 0;
    return str.replace(formatRegex, replCallback);
}

export function snprintf(buf, size, str, varargs) {
    let result = jsSprintf(str, varargs);
    // trim the string if too long
    if (size != -1 && result.length + 1 > size)
    {
        result = result.substring(0, (size > 0) ? (size - 1) : 0);
    }
    let out = getArrUint8(buf, result.length + 1);
    writeStr(out, result);

    // Null-terminate
    out[result.length] = 0;
    return result.length;
}

export function sprintf(buf, str, varargs) {
    let result = jsSprintf(str, varargs);

    let out = getArrUint8(buf, result.length + 1);
    writeStr(out, result);

    // Null-terminate
    out[result.length] = 0;
    return result.length;
}

export async function printf(str, varargs) {
    return await fprintf(1, str, varargs);
}

async function jsFputc(char, stream) {
    const handle = FILES[stream];

    if (handle) {
        if (handle.writeStream) {
            const buf = new DataView(new ArrayBuffer(1));
            buf.setUint8(0, (char & 0xFF));
            try {
                await handle.writer.write(buf);
                return 1;
            } catch (err) {
                console.error("jsFputc(char, stream) err: %o", err);
                return -1;
            }
        }
    } else {
        return -1;
    }
}

async function jsFwrite(ptr, size, nmemb, stream) {
    const handle = FILES[stream];

    if (handle) {
        const arr = getArrUint8(ptr, (size * nmemb));
        console.debug("[async] jsFwrite(%d, %d, %d) writing... %o to %o (%s)", ptr, size, nmemb, arr, handle, getStr(ptr));
        if (handle.writeStream) {
            console.debug("writer: %o", handle.writer);

            try {
                await handle.writer.write(arr);
                let writeLen = (size * nmemb);
                handle.writePos += writeLen;
                return writeLen;
            } catch (err) {
                console.error("[async] Write error: %o", err);
                handle.err = true;
                return -1;
            }
        } else {
            console.error("[async] Handle not writable %o", handle);
            // cancel because we're not actually going to do a promise
            return -1;
        }
    } else {
        console.error("[async] ??? file not found? handle is %o / stream is %o", handle, stream);
        return -1;
    }
}

export async function fprintf(stream, str, varargs) {
    let result = jsSprintf(str, varargs);
    // trim the string if too long
    if (result.length > BUFSIZ)
    {
        result = result.substring(0, BUFSIZ);
    }
    writeStr(internalBuffer, result);
    return await jsFwrite(internalBuffer.byteOffset, 1, result.length, stream);
}

export async function fputc(c, stream) {
    internalBuffer[0] = ((c|0) & 0xFF);
    return await fwrite(internalBuffer.byteOffset, 1, 1, stream);
}

export async function putchar(charValue) {
    return await fputc(charValue, 1);
}

export async function fputs(strPointer, stream) {
    try {
        const res = await jsFwrite(strPointer, 1, getStr(strPointer).length, stream);
        if (res >= 0) {
            await jsFputc(10|0, 1);
        }
        return res;
    } catch (err) {
        console.error("Got err during fputs: %s", err);
    }
}

export async function puts(strPointer) {
    return await fputs(strPointer, 1);
}

async function jsFgetc(handle) {
    if (handle && handle.readStream) {
        let c = handle.getchar();

        if (c === null || typeof c == "undefined") {
            if (handle.eof) {
                return -1;
            }

            handle.resetGetchar();
            const fgetcView = new DataView(new ArrayBuffer(1), 0, 1);
            const {done, value} = await handle.reader.read(fgetcView);

            if (done) {
                handle.eof = true;
                c = -1;
            } else {
                c = value.getUint8(0);
            }
        }

        return c;
    } else {
        return -1;
    }
}

async function scanValue(handle, arg, match, argnum, apostropheOrStar, malloc, length, width, conversion, group) {
    // argnum: 1, as in %1$s
    // apostropheOrStar: ' or * or '* or *'
    // malloc: m or nothing
    // length: a number
    // width: L, ll, l, h, hh
    // conversion: a conversion specifier char, or "[^letters]"

    console.log("scanValue(handle=%o, argnum=%s, apostropheOrStar=%s, malloc=%s, length=%s, width=%d, conversion=%d, group=%s)",
                handle, argnum, apostropheOrStar, malloc, length, width, conversion, group);

    return { value, read };
}

export async function fgetc(stream) {
    return await jsFgetc(FILES[stream]);
}

export async function fgets(s, size, stream) {
    // TODO stupid newlines, it should handle those
    const handle = FILES[stream];
    if (handle && handle.readStream) {
        const buf = getMemView(s, size - 1);
        handle.resetGetchar();
        await handle.reader.read(buf);
    } else {
        return 0;
    }
}

export async function getchar() {
    return await fgetc(stdin);
}

export function ungetc(c, stream) {
    const handle = FILES[stream];

    if (handle && handle.readStream) {
        handle.ungetchar(c);
        return c;
    } else {
        return -1;
    }
}

async function jsFscanf(stream, format, varargs) {
    const fmtStr = getStr(format);
    const handle = (typeof stream == "number") ? FILES[stream] : stream;

    const regions = getScanArgs(fmtStr, varargs);
    // Okay.... this is going to be reallllllly non-performant, probably
    // It's getchars allll the way :scream:

    let matchCount = 0;
    let c = -1;
    let offset = 0;

    for (const region of regions.values()) {
        let regionOffset = 0;

        switch (region.type) {
            case "whitespace": {
                while (-1 != (c = await jsFgetc(handle))) {
                    offset++;
                    if (!isspace(c)) {
                        offset--;
                        handle.ungetchar(c);
                        break;
                    }
                }
                break;
            }

            case "literal": {
                while (regionOffset < region.length
                       && (-1 != (c = await jsFgetc(handle)))) {

                    offset++;
                    if (c == region.str.charCodeAt(regionOffset)) {
                        // next literal char matches
                        regionOffset++;
                    } else {
                        // char did not match, stop matching
                        return matchCount;
                    }
                }
                break;
            }

            case "match": {
                let [ value, read ] = await region.arg.read(handle, offset);
                offset += read;

                console.warn("value, read: (%s, %s)", value, read);

                if (value && read >= 0) {
                    matchCount++;
                } else {
                    return matchCount;
                }
                break;
            }
        }
    }

    return matchCount;
}

export async function sscanf(str, format, varargs) {
    return await jsFscanf(new FileHandle(getStringReadStream(str), null, new FileMode("r")), format, varargs);
}

export async function fscanf(stream, format, varargs) {
    return await jsFscanf(stream, format, varargs);
}

export async function scanf(format, varargs) {
    return await fscanf(stdin, format, varargs);
}

function setupStandardStreams(settings) {
    if (settings.stdin) {
        // create an input stream from settings.stdin
        stdinFile = new FileHandle(wrapReadable(new ReadableStream(settings.stdin).getReader()),
            undefined, new FileMode("r"));
    } else {
        // create an empty input stream?
        stdinFile = new FileHandle(wrapReadable(new ReadableStream(
            new Uint8Array(0)).getReader()),
            undefined,
            new FileMode("r")
        );
    }

    if (settings.stdout && typeof(settings.stdout) === "function") {
        stdoutFile = new FileHandle(undefined, new WritableStream({
            write(chunk) {
                settings.stdout(utf8Decoder.decode(chunk));
            },
            close() {
                console.warn("stdout closed");
            },
            abort(err) {

            },
        }), new FileMode("w"));
    } else {
        stdoutFile = new FileHandle(undefined, new WritableStream({
            write(chunk) {
                console.log("STDOUT >>> ", utf8Decoder.decode(chunk));
            },
            close() {
                console.warn("stdout closed");
            },
            abort(err) {

            },
        }), new FileMode("w"));
    }

    if (settings.stderr && typeof(settings.stderr) === "function") {
        stderrFile = new FileHandle(undefined, new WritableStream({
            write(chunk) {
                settings.stderr(utf8Decoder.decode(chunk));
            },
            close() {
                console.warn("stderr closed");
            },
            abort(err) {

            },
        }), new FileMode("w"));
    } else {
        stderrFile = new FileHandle(undefined, new WritableStream({
            write(chunk) {
                console.error("STDERR >>> %s", utf8Decoder.decode(chunk));
            },
            close() {
                // don't do that
                console.warn("stderr closed");
            },
            abort(err) {

            },
        }), new FileMode("w"));
    }
}

export function postInstantiate(instance) {
    internalBuffer = getArrUint8(allocStaticHeap(BUFSIZ, 16), BUFSIZ);

    // stdin (0)
    registerFile(stdinFile);

    // stdout (1)
    registerFile(stdoutFile);

    // stderr (2)
    registerFile(stderrFile);
}

export default function configure(imports, settings) {
    fsConfig = settings ? settings.filesystem : null;

    initFilesystems(fsConfig);
    setupStandardStreams(settings);

    imports.env.printf = printf;
    imports.env.fprintf = fprintf;
    imports.env.snprintf = snprintf;
    imports.env.sprintf = sprintf;

    imports.env.vprintf = printf;
    imports.env.vfprintf = fprintf;
    imports.env.vsnprintf = snprintf;
    imports.env.vsprintf = sprintf;

    imports.env.sscanf = sscanf;
    imports.env.scanf = scanf;
    imports.env.fscanf = fscanf;

    imports.env.vsscanf = sscanf;
    imports.env.vscanf = scanf;
    imports.env.vfscanf = fscanf;

    imports.env.putchar = putchar;
    imports.env.puts = puts;
    imports.env.fputs = fputs;

    imports.env.fgetc = fgetc;
    imports.env.fgets = fgets;
    imports.env.getc = fgetc;
    imports.env.getchar = getchar;
    imports.env.ungetc = ungetc;

    // Async file functions - bynsync registration
    // TODO is this still necessary when using Asyncify?
    imports.bynsyncify.fopen = fopen;
    imports.bynsyncify.fwrite = fwrite;
    imports.bynsyncify.fread = fread;
    imports.bynsyncify.fprintf = fprintf;
    imports.bynsyncify.printf = printf;
    imports.bynsyncify.vfprintf = fprintf;
    imports.bynsyncify.vprintf = printf;
    imports.bynsyncify.puts = puts;
    imports.bynsyncify.fputc = fputc;
    imports.bynsyncify.putc = fputc;
    imports.bynsyncify.putchar = putchar;
    imports.bynsyncify.fputs = fputs;

    // Basic file functions
    imports.env.fopen = fopen;
    imports.env.fwrite = fwrite;
    imports.env.fread = fread;
    imports.env.fclose = fclose;
    imports.env.fputc = fputc;
    imports.env.putc = fputc;

    // File handle info functions
    imports.env.ftell = ftell;
    imports.env.fseek = fseek;
    imports.env.rewind = rewind;
    imports.env.fflush = fflush;
    imports.env.feof = feof;
    imports.env.ferr = ferror;
    imports.env.clearerr = clearerr;

    imports.env.access = access;
    imports.env.remove = remove;
}
