#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#define CNFG3D
#define CNFG_IMPLEMENTATION
#include "rawdraw_sf.h"

//#define async __attribute__((import_module("bynsyncify")))

void __attribute__((export_name("HandleKey"))) HandleKey( int keycode, int bDown )
{
    printf("Key: %d, %s\n", keycode, bDown ? "Down" : "Up");
}

void __attribute__((export_name("HandleButton"))) HandleButton( int x, int y, int button, int bDown )
{
    printf("Button: (%d, %d), button=%d, %s\n", x, y, button, bDown ? "Down" : "Up");
}

void __attribute__((export_name("HandleMotion"))) HandleMotion( int x, int y, int mask )
{
	printf("Motion: (%d, %d), mask=%d\n", x, y, mask);
}

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

    void* a = malloc(32768);
    void* b = malloc(1);
    void* c = malloc(1);
    printf("Malloc'd %u, %u, %u\n", a, b, c);

    free(c);
    c = NULL;

    free(b);
    b = NULL;

    b = malloc(1);
    printf("Re-malloc'd: %u, %u\n", a, b);
    putchar((int)a);
    putchar((int)b);

    free(a);
    a = NULL;

    free(b);
    b = NULL;

    FILE* fl = fopen("nvs.json", "w+");
    printf("Opened file f1=%p\n", fl);
    size_t out = fwrite("{\"test\": \"hello world\"}", 23, 1, fl);
    printf("Wrote %zu bytes\n", out);
    fclose(fl);

    fwrite("ahoy stdout", 1, 11, stdout);

    printf("ok\n");
    printf("stdin=%p\n", stdin);
    printf("stdout=%p\n", stdout);
    printf("stderr=%p\n", stderr);

    int fprintflen = fprintf(stderr, "Testing fprintf! Pi is %.3f, a string=%s\n", 3.14159265, "wooooo");
    printf("fprintflen=%d\n", fprintflen);

    FILE* txt = fopen("spiffs_image/test.txt", "r");
    const int chunk = 3;
    char buf[1024];
    int off = 0;
    int read = 0;
    while (chunk == (read = fread(buf + off, 1, chunk, txt))) {
        off += read;
        printf("read %d chars\n", read);
        printf("feof() == %d\n", feof(txt));
    }
    printf("feof() == %d\n", feof(txt));

    printf("total chars read %d\n", off);
    buf[off] = '\0';

    printf("Buf: %s\n", buf);
    fclose(txt);

    printf("~~~~~~~~~~\n");
    printf("multiple\nlines\nwhat\nhappens\nhere?\n");

    putchar('P');
    fputc('U', stdout);
    putchar('T');
    putc('C', stderr);
    putchar('H');
    putchar('A');
    putchar('R');
    putchar('\n');

    /*FILE* f4 = fopen("nvs.json", "w");
    printf("we actually returned from fopen()\n");
    fwrite("hello world", 12, 1, f4);
    fclose(f4);

    FILE* f2 = fopen("/spiffs_image/kid0.wsg", "r");
    fclose(f2);

    FILE* f3 = fopen("screenshot-123456789.png", "w");
    fclose(f3);*/

    printf("memcmp(textA, textB) == %d\n", memcmp(textA, textB, 7));
    printf("memcmp(textB, textA) == %d\n", memcmp(textB, textA, 7));

    const char h[] = "hello";
    const char hw[] = "hello world";
    printf("strcmp(hello, hello world) == %d\n", strcmp(h, hw));
    printf("strncmp(hello, hello world, 5) == %d\n", strncmp(h, hw, 5));
    printf("strncmp(hello, hello world, 6) == %d\n", strncmp(h, hw, 6));

    puts("adding\nmore\nlines\nto\nthe\nstdout\nto\ntest\nscrolling\nhere\n");
    fputs("how\nabout\nsome\nerrors\n", stderr);
    puts("and one more regular\n");

    printf("Setting up rawdraw...\n");
    //CNFGSetupFullscreen("Static HTML Rawdraw WASM Example", 0);
    CNFGSetup("Static HTML Rawdraw WASM Example", 480, 560);

    const char scanInput[] = "      str \t\n   \t\t \n\t 3.14159 64  0x36  test";
    float scanPi = 0.0;
    int scanInt = 0;
    unsigned char scanChar = '\0';
    char scanStr[6] = {0};
    printf("Scanning %s...\n", "something");
    int result = sscanf(scanInput, " str %f %d %hhx %5[^s]", &scanPi, &scanInt, &scanChar, &scanStr);
    printf("sscanf result=%d\n", result);

    if (result == 4) {
        printf("scanPi=%f, scanInt=%d, scanChar=%c, scanStr=%s\n", scanPi, scanInt, scanChar, scanStr);
    }

    int screenX, screenY;
    int count = 0;

    while (CNFGHandleInput()) {
        CNFGClearFrame();
        CNFGColor(0xFFFFFFFF);
        CNFGPenX = 40;
        CNFGPenY = 40;

        sprintf(buf, "Testing %d (%d)", count, count / 30);
        count++;
        CNFGDrawText(buf, 3);

        CNFGSwapBuffers();
    }

    return 0;
}
