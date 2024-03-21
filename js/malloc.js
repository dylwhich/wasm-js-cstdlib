import { getStr, writeStr, getArrUint8 } from './util/pointers.js'

// WebAssembly.Memory page size
const PAGE_SIZE = 64 * 1024;
const BLOCK_SIZE = 256;

function sortedIndex(array, value) {
    var low = 0,
        high = array.length;

    while (low < high) {
        var mid = (low + high) >>> 1;
        if (array[mid] < value) low = mid + 1;
        else high = mid;
    }
    return low;
}

class HeapAllocation {
    constructor(startBlock, bytes) {
        this.startBlock = startBlock;
        this.blocks = ((bytes + BLOCK_SIZE - 1) / BLOCK_SIZE) | 0;
        this.bytes = bytes;
    }
}

class HeapBlock {
    constructor(addr, allocation) {
        this.start = addr;
        this.allocation = allocation;
    }

    get size() {
        return BLOCK_SIZE;
    }
}

class JsHeap {
    constructor(memory, heap_base) {
        this.memory = memory;
        this.heap_base = heap_base;

        // Set start to the next 256-byte alignment point after the heap base
        this.start = ((heap_base + BLOCK_SIZE - 1) / BLOCK_SIZE) | 0;
        this.top = this.start;

        // All HeapBlocks of memory that have been allocated
        this.blocks = [];

        // A list of block INDICES (not actual blocks) which are free
        this.freeBlocks = [];

        // A map of address -> HeapAllocation objects which contain the number of bytes/blocks
        this.allocations = {};
    }

    // Marks a continuous region of memory as free
    #markFree(start, end) {
        const ins = Array.from({length: end - start + 1}, (e, i) => {i + start});
        this.freeBlocks.splice(sortedIndex(this.freeBlocks, start) + 1, 0, ins);
    }

    #markUsed(start, end) {
        // TODO make sure this actually works???
        this.freeBlocks.splice(sortedIndex(this.freeBlocks, start), end - start + 1);
    }

    /*findBlockIndex(addr) {
        let index = ((addr - this.start) / 256) / 0;
        if (index >= 0 && index < this.blocks.length) {
            return index;
        }

        return -1;
    }*/

    #isRegionFree(startIndex, blockCount) {
        let i = sortedIndex(this.freeBlocks, startIndex);
        let count = 0;

        while (i < this.freeBlocks.length && count < blockCount && this.freeBlocks[i] == (startIndex + count)) {
            count++; i++;
        };

        return count == blockCount;
    }

    #findContinuousRegion(blockCount) {
        if (this.freeBlocks.length < blockCount)
        {
            return -1;
        }

        let regionStart = 0;
        let regionLen = 0;

        let curStart = 0;
        let curLen = 0;

        let last = -1;
        // go one iteration past the last block to make the logic simpler
        for (let i = 0; i <= this.freeBlocks.length; i++) {
            if (i == 0 || (i < this.freeBlocks.length && this.freeBlocks[i] == (last + 1))) {
                // Current free block is the one immediately following the previous, still continuous
                curLen++;
            } else {
                // Check if the previously-found block was suitable
                if (curLen >= blockCount) {
                    // The current block is big enough to contain the requested block...
                    if (regionLen == 0 || curLen < regionLen) {
                        // The current block is more appropriate (smaller) than any previously found blocks
                        // (or it's the only block so far)

                        // Save this region as the "best" one
                        regionStart = curStart;
                        regionLen = curLen;
                    }
                }

                curStart++;
                curLen = 0;

                if (i == this.freeBlocks.length) {
                    break;
                }
            }

            last = this.freeBlocks[i];
        }

        // Check if we found a suitable region and return its start block index, otherwise return -1
        if (regionLen >= blockCount) {
            return this.freeBlocks[regionStart];
        } else {
            return -1;
        }
    }

    #allocateNew(blockCount) {
        // If there are any free blocks at the very end of heap, use as many as possible
        let endBlocksFree = 0;
        while (this.freeBlocks.at(-1 - endBlocksFree) == (this.blocks.length - 1 - endBlocksFree)) {
            endBlocksFree++;
        }

        let newBlocks = blockCount - endBlocksFree;
        let index = this.blocks.length - endBlocksFree;
        this.top += (BLOCK_SIZE * newBlocks);

        // Calculate total number of pages needed to store the heap
        let curPageCount = ((this.memory.buffer.byteLength / PAGE_SIZE) | 0);
        let pagesNeeded = ((this.top + PAGE_SIZE - 1) / PAGE_SIZE) | 0;
        if (pagesNeeded > curPageCount) {
            this.memory.grow(pagesNeeded - curPageCount);
        }

        for (let i = 0; i < newBlocks; i++) {
            this.blocks.push(new HeapBlock(this.start + BLOCK_SIZE * this.blocks.length, null));
        }

        return index;
    }

    allocate(size) {
        if (size == 0) {
            return 0;
        }

        const blocksNeeded = ((size + BLOCK_SIZE - 1) / BLOCK_SIZE) | 0;
        let firstBlockInd = this.#findContinuousRegion(blocksNeeded);
        if (firstBlockInd == -1) {
            firstBlockInd = this.#allocateNew(blocksNeeded, size);
        }

        if (firstBlockInd == -1) {
            console.log("Couldn't allocate more memory???");
            return 0;
        }

        const alloc = new HeapAllocation(firstBlockInd, size);

        for (let i = 0; i < blocksNeeded; i++) {
            this.blocks[firstBlockInd + i].allocation = alloc;
        }

        const startAddr = this.blocks[firstBlockInd].start;
        this.allocations[startAddr] = alloc;

        return startAddr;
    }

    reallocate(address, size) {
        // realloc(ptr, 0) is equivalent to free(ptr)
        if (size == 0) {
            this.deallocate(address);
            return 0;
        }

        if (this.allocations[address]) {
            const alloc = this.allocations[address];
            const newBlockCount = ((size + BLOCK_SIZE - 1) / BLOCK_SIZE | 0);

            if (size <= alloc.bytes) {
                // TODO: Support shrinking... pretty straightforward actually
                // But for now just return the original block, they'll never know it's still the same size!
                return address;
            } else {
                if (newBlockCount > alloc.blocks) {
                    // Need to grow the allocation...
                    // First check if we can grow it in-place -- this would be possible only if the last block
                    // of the allocation is also the last block, or, if
                    const firstNewBlockIdx = alloc.startBlock + newBlockCount - 1;

                    // Either the last index of the blocks array, or the last index of the region we will need to allocate
                    // -- whichever is lower
                    // Really, it's the new end index of the allocated region, clamped to the currently allocated array
                    // This is so we can just check whether all the blocks up to this are free, and then allocate any extras
                    const newRegionEnd = (firstNewBlockIdx + newBlockCount);
                    // The number of blocks we can grow into existing unallocated blocks
                    const blocksToGrow = (newRegionEnd < this.blocks.length) ? (newRegionEnd - firstNewBlockIdx) : (this.blocks.length - firstNewBlockIdx);
                    // The number of blocks we need to allocate beyond the existing
                    const blocksToAllocate = (newRegionEnd < this.blocks.length) ? 0 : (newRegionEnd - this.blocks.length - 1);

                    if ((blocksToGrow == 0) || this.#isRegionFree(firstNewBlockIdx, blocksToGrow)) {
                        // Mark any existing blocks we're growing into as used
                        if (blocksToGrow > 0) {
                            this.#markUsed(firstNewBlockIdx, firstNewBlockIdx + blocksToGrow);
                        }

                        // Allocate any new blocks needed
                        if (blocksToAllocate > 0) {
                            const allocatedNewIdx = this.#allocateNew(blocksToAllocate);
                            // Verify that the newly allocated region actually is contiguous with the current one
                            if (allocatedNewIdx != (firstNewBlockIdx + blocksToGrow)) {
                                console.error("Newly allocated block is WRONG!");
                                return 0;
                            }
                        }

                        // Update ALL the newly allocated blocks to have the new allocation
                        for (let i = firstNewBlockIdx; i <= newRegionEnd; i++) {
                            this.blocks[i].alloc = alloc;
                        }

                        // Update the actual allocation
                        alloc.bytes = size;
                        alloc.blockCount = newBlockCount;

                        // We can return the original address since we only resized the block
                        return address;
                    }

                    // We can't grow the allocation in-place, so copy it...
                    const tmp = new Uint8Array(getArrUint8(address, alloc.size));

                    // Then free the original
                    this.deallocate(address);

                    // Allocate new memory
                    const resultAddr = this.allocate(size);
                    let destArray = getArrUint8(resultAddr, tmp.byteLength);

                    // And finally copy the original data into the new block
                    destArray.set(tmp);
                    return address;
                } else {
                    // We don't need to allocate another block!
                    alloc.size = size;
                    return address;
                }
            }
        } else {
            console.error("realloc() received invalid pointer")
            return 0;
        }
    }

    deallocate(address) {
        if (this.allocations[address]) {
            let alloc = this.allocations[address];
            let endBlock = alloc.startBlock + alloc.blocks - 1;

            this.#markFree(alloc.startBlock, endBlock);
            for (let i = alloc.startBlock; i < endBlock; i++) {
                this.blocks[i].allocation = null;
            }

            // Remove the allocation from the map
            delete this.allocations[address];
        }
    }
}

let heap = undefined;

export function malloc(size) {
    if (heap === undefined) {
        return 0;
    }

    return heap.allocate(size);
}

export function calloc(nmemb, size) {
    if (heap === undefined) {
        return 0;
    }

    const addr = heap.allocate(size);

    // Be a good calloc and zero out the data
    let data = getArrUint8(addr, size);

    for (let i = 0; i < size; i++) {
        data[i] = 0;
    }

    return addr;
}

export function realloc(ptr, size) {
    if (heap === undefined) {
        return 0;
    }

    return heap.reallocate(ptr, size);
}

export function reallocarray(ptr, nmemb, size) {
    if (heap === undefined) {
        return 0;
    }

    return heap.reallocate(ptr, nmemb * size);
}

export function free(ptr) {
    if (ptr != 0) {
        heap.deallocate(ptr);
    }
}

export function postInstantiate(instance) {
    heap = new JsHeap(memory, instance.exports.__heap_base);
}

export default function configure(imports, settings) {
    memory = imports.env.memory;

    imports.env.malloc = malloc;
    imports.env.calloc = calloc;
    imports.env.realloc = realloc;
    imports.env.reallocarray = reallocarray;
    imports.env.free = free;
}
