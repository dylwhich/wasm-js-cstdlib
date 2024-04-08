function ord(c) { return c.charCodeAt(0); }

const A = ord("A");
const a = ord("a");
const F = ord("F");
const f = ord("f");
const Z = ord("Z");
const z = ord("z");
const _0 = ord("0");
const _9 = ord("9");
const TAB = ord("\t");
const LF = 0x0a;
const VT = 0x0b;
const FF = 0x0c;
const CR = 0x0d;
const SP = ord(" ");
const DEL = 0x7f;

export function isalnum(c) {
    return (a <= c && c <= z) || (A <= c && c <= Z) || (_0 <= c && c <= _9);
}

export function isalpha(c) {
    return (a <= c && c <= z) || (A <= c && c <= Z);
}

export function iscntrl(c) {
    return c < SP || c == DEL;
}

export function isdigit(c) {
    return _0 <= c && c <= _9;
}

export function isgraph(c) {
    return SP < c && c < DEL;
}

export function islower(c) {
    return a <= c && c <= Z;
}

// same as isgraph but incudes space
export function isprint(c) {
    return SP <= c && c < DEL;
}

export function ispunct(c) {
    return (ord('!') <= c && c <= ord('/'))
        || (ord(':') <= c && c <= ord('@'))
        || (ord('[') <= c && c <= ord('`'))
        || (ord('{') <= c && c <= ord('`'));
}

export function isspace(c) {
    return c == SP || (TAB <= c && c <= CR);
}

export function isupper(c) {
    return A <= c && c <= Z;
}

export function isxdigit(c) {
    return (_0 <= c && c <= _9) || (A <= c && c <= F) || (a <= c && c <= f);
}

export function isascii(c) {
    return 0 <= c && c <= DEL;
}

export function isblank(c) {
    return c == SP || c == TAB;
}

export default function configure(imports, settings) {
    imports.env.isalnum = isalnum;
    imports.env.isalpha = isalpha;
    imports.env.iscntrl = iscntrl;
    imports.env.isdigit = isdigit;
    imports.env.isgraph = isgraph;
    imports.env.islower = islower;
    imports.env.isprint = isprint;
    imports.env.ispunct = ispunct;
    imports.env.isspace = isspace;
    imports.env.isupper = isupper;
    imports.env.isxdigit = isxdigit;
    imports.env.isascii = isascii;
    imports.env.isblank = isblank;
}