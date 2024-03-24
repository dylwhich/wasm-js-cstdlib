import { getStr, getWideStr, writeStr, getMemView, getArrUint8, hexdump, getPtrAligned, endian, allocStaticHeap, getArrUint32 } from './util/pointers.js'
import { asyncSuspend, asyncCancel, asyncResume } from './util/asyncify.js';

export const EOF = -1;
export const F_OK = 0;
export const SEEK_SET = 0;
export const SEEK_CUR = 1;
export const SEEK_END = 2;

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

// The mode portion of an fopen() call, e.g. "r" or "a+" or "wb+"
class FileMode {
    #read;
    #write;

    #readPos;
    #writePos;

    #create;
    #truncate;

    constructor(modeStr) {
        let read = false;
        let readPos = 0;

        let write = false;
        let writePos = 0;

        let mainMode = null;

        let create = false;
        let trunc = false;

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
                    // ignored
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
            let buf = new ArrayBuffer(8, {maxByteLength: 32768});
            let offset = 0;
            return new WritableStream({
                write(chunk) {
                    return new Promise((resolve, reject) => {
                        // chunk should be a Uint8Array
                        while (offset + chunk.length > buf.length) {
                            buf.resize(offset + chunk.length);
                        }

                        // do an awful slow thing
                        for (let i = 0; i < chunk.length; i++) {
                            buf[offset + i] = chunk[i];
                        }
                        offset += chunk.length;

                        resolve();
                    });
                },
                close() {
                    // Actually write the item
                    console.debug("Writing %s bytes to localStorage@%s", offset, path);
                    localStorage.setItem(path, utf8Encoder.encode(buf.slice(0, offset)));
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
        console.log("localStorage.open(%o, %o)", path, mode);
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
                    console.log("%s + %s --> %s", key, path, trimmed);

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
        // TODO: Scrape basic HTML directory listings
        // Should be real straightforward for a browser
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
                const doc = parser.parseFromString(response.body.getReader)

                doc.querySelectorAll("a[href]").forEach((link) => {
                    const href = link.getAttribute("href");
                    if (href.match(/\//g).length < 2) {
                        // less than 2 slashes, we're probably good
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

// all open files
const FILES = [];

// file handle versions of
export const stdin = new WebAssembly.Global({value: "i32", mutable: true}, 0|0);
export const stdout = new WebAssembly.Global({value: "i32", mutable: true}, 1|0);
export const stderr = new WebAssembly.Global({value: "i32", mutable: true}, 2|0);

// file versions of stdin/stdout/stderr
let stdinFile = null;
let stdoutFile = null;
let stderrFile = null;

// The next value we will return for an fopen() call
let curFd = 0;

let fsConfig = {};

// the JS instances, indexed by file descriptor
const fsInstances = {};

// some wasm memory allocated for file streams
// Uint32Array
let fds;

function registerFile(handle) {
    console.log("Registered file %o to fd=%o", handle, curFd);
    FILES[curFd] = handle;
    //fds[curFd] = curFd|0;
    //hexdump(fds.byteOffset, 64);
    return curFd++;
}

function unregisterFile(fd) {
    FILES[fd] = undefined;
    //fds[fd] = 0xFFFFFFFF|0;
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

    console.log("fsInstances", fsInstances);
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

/*function resolveFile(sources) {
    return
}*/

let fopenRes = null;
export function fopen(pathname, mode) {
    if (asyncSuspend()) {
        // parse the path
        // look up the filesystem config for that path (make a function for that)
        console.debug("fopen(%s, %s)", getStr(pathname), getStr(mode));
        const parsedMode = new FileMode(getStr(mode));
        const pathStr = getStr(pathname);

        console.debug("fopen(%s, %o)", pathStr, parsedMode);
        const filesystems = getFilesystems(pathStr, parsedMode);
        console.log(filesystems);


        const search = [...filesystems.values()];
        console.log("search=%o", search);
        const promises = search.map((val) => {
            console.log("val=%o\n", val);
            if (val.fs) {
                let promise = val.fs.open(val.path, parsedMode);
                console.log("promise=%o", promise);
                return promise;
            } else {
                return Promise.resolve();
            }
            //return val.fs ? val.fs.open(val.path) : Promise.resolve();
        });

        Promise.all(promises).then((results) => {
            let out = null;
            console.log("Got all results %o", results);
            for (let i = 0; i < results.length; i++) {
                if (results[i]) {
                    out = results[i];
                    console.log("found %o in loop", out);
                    break;
                } else {
                    console.log("results[%o] is false?? %o", i, results[i]);
                }
            }

            if (out) {
                console.log("found %o", out);
            } else {
                console.log("didn't find");
            }

            return out;
        }).then((res) => {
            console.log("aaaa, %o", res);
            fopenRes = registerFile(res);
            asyncResume();
        });

    } else {
        // do something with result?? return?
        console.log("handle is now %o", fopenRes);
        const ret = fopenRes;
        fopenRes = null;
        return ret;
    }
}

export function fclose(stream) {
    const handle = FILES[stream];

    if (handle) {
        if (handle.readStream) {
            console.log("closing readStream? %o", handle.readStream);
            if (handle.readStream.locked) {
                console.log("not closing bc it's locked!");
            } else {
                console.log("cancel=%o", handle.readStream.cancel());
            }
        }

        if (handle.writeStream) {
            console.log("closing writeStream? %o", handle.writeStream);
            if (handle.writeStream.locked) {
                handle.writer.close().then((x) => {
                    console.log("x: %o", x);
                }).catch((err) => { console.error("writeStream.close(): %o", err);});
            } else {
                handle.writeStream.close().then(() => {
                    console.log("Closed! in the background...");
                });
            }
        }

        unregisterFile(stream);
    }

    return 0;
}

export function fseek(stream, offset, whence) {

}

export function ftell(stream) {

}

export function rewind(stream) {
    // TODO

}

export function feof(strem) {
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

function wrapReadable(read) {
    return function(r) {
        console.log("Wrapping %o", r);
        return new ReadableStream({
            type: "bytes",
            start(controller) {
                function push() {
                    r.read().then(({ done, value }) => {
                        if (value) {
                            controller.enqueue(value);
                            console.log("PUSHED value is %o", value);
                        }

                        if (done) {
                            controller.close();
                            console.log("can i close %o", r);
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

function _wrapReadable(read) {
    return function(r) {
        let buffer = new ArrayBuffer(16, { maxByteLength: 1024 * 1024 * 1024 });
        let bytes = new Uint8Array(buffer);
        // view onto the unused portion of the buffer
        let bufView = new DataView(buffer, 0, 0);
        let count = 0;
        let read = 0;
        let readAll = false;

        return new ReadableStream({
            type: "bytes",
            start(controller) {

            },

            async pull(controller) {
                const view = controller.byobRequest.view;
                let written = 0;
                let start = bufView.byteOffset;
                let len = bufView.byteLength;

                if (!readAll && bufView.byteLength < view.byteLength) {
                    const newData = await r.read();
                    if (newData.done) {
                        readAll = true;
                        console.log("Done!");
                        controller.close();
                    }
                    console.log(newData);

                    // if the buffer is completely empty, make sure to move it to the start
                    if (len == 0) {
                        start = 0;
                    }

                    if (newData.value) {
                        // Create a new view, big enough for all the old+new data
                        len += newData.value.byteLength;
                        bufView = new DataView(buffer, start, len);

                        // Copy the data into the new part of the view
                        for (let i = 0; i < newData.value.byteLength; i++) {
                            bufView[start + i] = newData[i];
                        }
                    }
                }

                // Write the data now, wherever it came from
                for (; written < view.byteLength && written < len; written++) {
                    view[written] = bufView[written];
                }

                console.log("wrote %d to view %o", written, view);

                console.log("moving buf from off=%o, len=%o to off=%o, len=%o, written=%o",
                            start, len, start + written, len - written, written);


                bufView = new DataView(buffer, start + written, len - written);

                controller.byobRequest.respond(written);
            }
        });
    }(read);
}


// returns a stream
function wrapReader(reader) {
    return function(r) {
        return new ReadableStream({
            type: "bytes",
            start(controller) {
                // The following function handles each data chunk
                function push() {
                    // "done" is a Boolean and value a "Uint8Array"
                    r.read().then(({ done, value }) => {
                        // If there is no more data to read
                        console.log("done=%o, value=%o", done, value);
                        if (done) {
                            controller.close();
                            return;
                        }
                        // Get the data and send it to the browser via the controller
                        controller.enqueue(value);
                        // Check chunks by logging to the console
                        console.log(done, value);
                        push();
                    });
                }
                push();
            },
        });
    }(reader);
}

let freadLen = undefined;
export function fread(ptr, size, nmemb, stream) {
    if (asyncSuspend()) {
        const handle = FILES[stream];

        if (handle) {
            //const view = getMemView(ptr, size * nmemb);
            //const view = getArrUint8(ptr, size * nmemb);
            const readLen = size * nmemb|0;
            // number of bytes already written out to the caller's buf
            // (if we repeat the fetch in the middle of the read)
            let queued = 0;
            freadLen = 0;

            function fetchMore() {
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
                            handle.reader.unl
                            handle.reader.closed.then(() => {
                                handle.eof = true;
                                console.log("locked?????", handle.reader.locked);
                                asyncResume();
                            }).catch((err) => {
                                console.error("err on reader.closed()! %o", err);
                                asyncResume();
                            });
                        } else {
                            console.log("Unexpectedly done???");
                            handle.eof = true;
                            asyncResume();
                        }
                    } else {
                        // we're done or got all the things, return!
                        asyncResume();
                    }

                }).catch((err) => {
                    console.error("err: %o", err);
                    freadLen = 0;
                    // todo error codes
                    handle.err = 1;

                    asyncResume();
                });
            }

            fetchMore();

            return 0;
        } else {
            asyncCancel();
            return -1;
        }
    } else {
        let res = freadLen;
        freadLen = undefined;
        return res;
    }

    return 0;
}

let fwriteLen = undefined;
export function fwrite(ptr, size, nmemb, stream) {
    if (asyncSuspend()) {
        const handle = FILES[stream];

        if (handle) {
            console.log("writing... %o to %o", getArrUint8(ptr, (size * nmemb)), handle);
            if (handle.writeStream) {
                console.log("writer: %o", handle.writer);
                handle.writer.write(getArrUint8(ptr, (size * nmemb))).then(
                    (res) => {
                        fwriteLen = (size * nmemb);
                        handle.writePos += fwriteLen;
                        asyncResume();
                    }
                ).catch((err) => {
                    console.log("Write error: %o", err);
                    fwriteLen = -1;
                    asyncResume();
                });
                // won't actually return here since we are suspended
                return 0;
            } else {
                // cancel because we're not actually going to do a promise
                asyncCancel();
                console.error("attempt to write to incompatible file handle %o", handle);
                console.error("handle fd=%o", FILES.indexOf(handle));
                // TODO errno and such
                return -1;
            }
        } else {
            asyncCancel();
            console.error("??? file not found? handle is %o / stream is %o", handle, stream);
            return -1;
        }
    } else {
        return fwriteLen;
    }

    return 0;
}

// TODO / Not Yet Supported:
// - %2$s format
// - %n
// - %25s string lengthing
// - %*s style pointers
// this means random code might fail if sprintf isn't working as expected
function jsSprintf(cStr, varargs) {
	const regex = /%(-)?(0?[0-9]+)?([.][0-9]+)?([#][0-9]+)?(L|z|ll?|hh?)?([scfgpexdu%])/g;
    const str = getStr(cStr);

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
                case 'hh': width = 1;  break; // char aka
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

        [...str.matchAll(regex)].forEach(element => {
            sizesCallback(...element);
        });
    }

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

	return str.replace(regex, replCallback);
}

export function snprintf(buf, size, str, varargs) {
    result = jsSprintf(str, varargs);
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

export function printf(str, varargs) {
    let result = jsSprintf(str, varargs);
    //stdoutFile.writeStream
    console.log(result);
    return result.length;
}

export function putchar(charValue) {
    if (charValue >= 0x20 && charValue <= 0x7F) {
        console.log(String.fromCharCode(charValue));
    } else {
        console.log("\\x%s", charValue.toString(16));
    }
    return charValue;
}

export function puts(strPointer) {
    console.log(getStr(strPointer));
    return 1;
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
                settings.stdout(chunk);
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
                console.log("STDOUT >>> ", chunk);
            },
            close() {
                console.warn("stdout closed");
            },
            abort(err) {

            },
        }), new FileMode("w"));
    }

    if (settings.stderr && typeof(settings.stder) === "function") {
        stderrFile = new FileHandle(undefined, new WritableStream({
            write(chunk) {
                settings.stderr(chunk);
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
                console.error("STDERR >>> ", chunk);
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
    console.log(instance.exports);

    //fds = getArrUint32(allocStaticHeap(512 * 4, 4), 512 * 4);

    // stdin (0)
    //stdin.value = (fds.byteOffset) + registerFile(stdinFile) * 4;
    registerFile(stdinFile);
    console.debug("stdin=%o (%o)", stdinFile, stdin.value);

    // stdout (1)
    //stdout.value = (fds.byteOffset) + registerFile(stdoutFile) * 4;
    registerFile(stdoutFile);
    console.debug("stdout=%o (%o)", stdoutFile, stdout.value);

    // stderr (2)
    //stderr.value = (fds.byteOffset) + registerFile(stderrFile) * 4;
    registerFile(stderrFile);
    console.debug("stderr=%o (%o)", stderrFile, stderr.value);
}

export default function configure(imports, settings) {
    fsConfig = settings ? settings.filesystem : null;

    initFilesystems(fsConfig);
    setupStandardStreams(settings);

    //console.log("imported stdin=%o", imports.env.stdin);
    //console.log("imported stdout=%o", imports.env.stdout);
    //console.log("imported stderr=%o", imports.env.stderr);

    imports.env.printf = printf;
    //imports.env.fprintf = fprintf;
    imports.env.snprintf = snprintf;
    imports.env.sprintf = sprintf;
    imports.env.putchar = putchar;
    imports.env.puts = puts;

    // Async file functions - bynsync registration
    imports.bynsyncify.fopen = fopen;
    imports.bynsyncify.fwrite = fwrite;
    imports.bynsyncify.fread = fread;

    // Basic file functions
    imports.env.fopen = fopen;
    imports.env.fwrite = fwrite;
    imports.env.fread = fread;
    imports.env.fclose = fclose;

    // File handle info functions
    imports.env.ftell = ftell;
    imports.env.fseek = fseek;
    imports.env.rewind = rewind;
    imports.env.feof = feof;
    imports.env.ferr = ferror;
    imports.env.clearerr = clearerr;
}
