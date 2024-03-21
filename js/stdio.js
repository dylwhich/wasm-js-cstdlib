import { getStr, getWideStr, writeStr, getPtr, getArrUint8, hexdump, getPtrAligned, endian } from './util/pointers.js'

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
                return this.view.getUint64(0, endian);
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
                return this.view.getInt64(0, endian);
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
                    return parseInt(this.address);

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

export default function configure(imports, settings) {
    imports.env.snprintf = snprintf;
    imports.env.sprintf = sprintf;
    imports.env.printf = printf;
    imports.env.putchar = putchar;
    imports.env.puts = puts;
}
