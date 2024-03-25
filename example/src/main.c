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

    stdin = (FILE*)0;
    stdout = (FILE*)1;
    stderr = (FILE*)2;

    printf("ok\n");
    printf("stdin=%p", stdin);
    printf("stdout=%p", stdout);
    printf("stderr=%p", stderr);

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
        printf("feof() == %d", feof(txt));
    }
    printf("feof() == %d", feof(txt));

    printf("total chars read %d", off);
    buf[off] = '\0';

    printf("Buf: %s\n", buf);
    fclose(txt);

    printf("~~~~~~~~~~");

    /*FILE* f4 = fopen("nvs.json", "w");
    printf("we actually returned from fopen()\n");
    fwrite("hello world", 12, 1, f4);
    fclose(f4);

    FILE* f2 = fopen("/spiffs_image/kid0.wsg", "r");
    fclose(f2);

    FILE* f3 = fopen("screenshot-123456789.png", "w");
    fclose(f3);*/

    return 0;
}
