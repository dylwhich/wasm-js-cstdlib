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
}
