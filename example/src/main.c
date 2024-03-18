#include <stdio.h>

int __attribute__((export_name("main"))) main(int argc, char** argv) {
    printf("argc: %d\n", argc);
    return 0;
}
