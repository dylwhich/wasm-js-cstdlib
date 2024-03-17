# wasm-js-cstdlib

The goal of wasm-js-cstdlib is to provide a standalone javascript implementation of a subset of the
C Standard Library, which can be imported into a WebAssembly module. File I/O can be configured to
emulate a file operations using either HTTP REST operations with an included server, or the local
storage API, or a combination of both. Some things like socket I/O will be stubbed.


