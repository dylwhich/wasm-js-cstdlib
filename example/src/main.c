#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int __attribute__((export_name("main"))) main(int argc, char** argv) {
    printf("argc: %d\n", argc);

    const char textA[] = "Hello!";
    const char textB[] = "Second text";
    int signedIntA = 255;
    int signedIntB = -123456789;
    unsigned int unsignedInt = 0xDEADBEEF;
    char letter = '!';
    float aFloat = 420.69;

    const char* format = "I'm a format string. %s (%p), %s (%p), %d, %d, %x, %c, %.2f\n";
    printf(format, textA, textA, textB, textB, signedIntA, signedIntB, unsignedInt, letter, aFloat);

    return 0;
}
