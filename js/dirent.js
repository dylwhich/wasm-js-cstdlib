export function opendir(dir) {
    return 0;
}

export function readdir(dir) {
    return 0;
}

export function closedir(dir) {
    return 0;
}

export default function configure(imports, settings) {
    imports.env.opendir = opendir;
    imports.env.readdir = readdir;
    imports.env.closedir = closedir;
}
