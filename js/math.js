import { getStr, getWideStr, writeStr, getMemView, getArrUint8, hexdump, getPtrAligned, endian, allocStaticHeap, getArrUint32 } from './util/pointers.js'

export const cos = Math.cos;
export const cosf = Math.cos;

export const sin = Math.sin;
export const sinf = Math.sin;

export const tan = Math.tan;
export const tanf = Math.tan;

export const atan2 = Math.atan2;
export const atan2f = Math.atan2;

export const ceil = Math.ceil;
export const ceilf = Math.ceil;

export const floor = Math.floor;
export const floorf = Math.floor;

// TODO does this have the same semantics as in C??
export const round = Math.round;
export const roundf = Math.round

export const fabs = Math.abs;
export const fabsf = Math.abs;

export const sqrt = Math.sqrt;
export const sqrtf = Math.sqrt;

export const exp = Math.exp;
export const expf = Math.exp;

export const log = Math.log;
export const pow = Math.pow;

function ldexp(mantissa, exponent) {
    var steps = Math.min(3, Math.ceil(Math.abs(exponent) / 1023));
    var result = mantissa;
    for (var i = 0; i < steps; i++)
        result *= Math.pow(2, Math.floor((exponent + i) / steps));
    return result;
}

export function frexp(value, intptr) {
    let destPtr = getPtrInt32(intptr);

    if (value === 0) {
        destPtr[0] = 0;
        return value;
    }

    var data = new DataView(new ArrayBuffer(8));
    data.setFloat64(0, value);
    var bits = (data.getUint32(0) >>> 20) & 0x7FF;
    if (bits === 0) { // denormal
        data.setFloat64(0, value * Math.pow(2, 64));  // exp + 64
        bits = ((data.getUint32(0) >>> 20) & 0x7FF) - 64;
    }
    var exponent = bits - 1022;
    var mantissa = ldexp(value, -exponent);

    destPtr[0] = exponent;
    return mantissa;
}

export default function configure(imports, settings) {
    imports.env.cos = cos;
    imports.env.cosf = cosf;
    imports.env.sin = sin;
    imports.env.sinf = sinf;
    imports.env.tan = tan;
    imports.env.tanf = tanf;
    imports.env.atan2 = atan2;
    imports.env.atan2f = atan2f;
    imports.env.ceil = ceil;
    imports.env.ceilf = ceilf;
    imports.env.floor = floor;
    imports.env.floorf = floorf;
    imports.env.round = round;
    imports.env.roundf = roundf;
    imports.env.fabs = fabs;
    imports.env.fabsf = fabsf;
    imports.env.sqrt = sqrt;
    imports.env.sqrtf = sqrtf;
    imports.env.exp = exp;
    imports.env.expf = expf;
    imports.env.frexp = frexp;
    imports.env.frexpf = frexp;
    imports.env.exp = exp;
    imports.env.expf = exp;
    imports.env.pow = pow;
    imports.env.powf = pow;
}
