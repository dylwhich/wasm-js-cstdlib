TERSER?=uglifyjs
TERSERFLAGS = -d RAWDRAW_USE_LOOP_FUNCTION=false -d RAWDRAW_NEED_BLITTER=true

SOURCES = src/main.c ../src/shim.c
DEFINES = -DCOOL

CC_WASM = clang

CFLAGS_WASM = \
	-DWASM \
	-nostartfiles \
	-flto -Oz \
	-Wl,--lto-O3 \
	-Wl,--no-entry \
	-Wl,--allow-undefined \
	-Wl,--import-memory \
	-Wl,--export=__heap_base

CFLAGS_WASM += \
	-nostdlib \
	--target=wasm32 \
	-isystem../include

WASMOPT ?= wasm-opt
WOFLAGS += --asyncify --pass-arg=asyncify-import@bynsyncify.* --pass-arg=asyncify-ignore-indirect

all: index.html

.PHONY: all clean

# Compile helper C program for substituting WASM into JS/HTML template files
subst: subst.c
	$(CC) -o $@ $^

main.wasm: $(SOURCES)
	$(CC_WASM) $(CFLAGS_WASM) $(DEFINES) $(INC) $^ -o $@
	$(WASMOPT) $(WOFLAGS) -Oz $@ -o $@

# Build base64 blob file version of raw emulator WASM output
blob_b64: main.wasm
	base64 $< | sed -e "$$ ! {/./s/$$/ \\\\/}" > $@

# Substitute the blob into the template into an intermediate JS file
mid.js: template.js subst blob_b64
	./subst template.js -s -f BLOB blob_b64 -o $@

# Minify the intermediate JS into the final output
opt.js: template.js mid.js
	$(TERSER) $(TERSERFLAGS) mid.js -o $@

index.html: template.ht opt.js
	./subst template.ht -s -f JAVASCRIPT_DATA opt.js -o $@

clean:
	rm -f subst index.html blob_b64 opt.js mid.js
