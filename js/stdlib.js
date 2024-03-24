import { getStr } from './util/pointers.js'

export function exit(status) {
    console.log("exit");
}

export const abs = Math.abs;
export const labs = Math.abs;
export const llabs = Math.abs;

export function atoi(nptr) {
    return parseInt(nptr);
}

export function atol(nptr) {
    return parseInt(nptr);
}

export function atoll(nptr) {
    return parseInt(nptr);
}

export function getenv(name) {
    return 0;
}

export function qsort(name) {

}

export default function configure(imports, settings) {

}