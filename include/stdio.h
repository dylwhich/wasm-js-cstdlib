#pragma once

#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>

#define BUFSIZ 8192
#define EOF (-1)
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#define F_OK 0

typedef int FILE;

typedef long fpos_t;

extern FILE *stdin;
extern FILE *stdout;
extern FILE *stderr;

#define stdin stdin
#define stdout stdout
#define stderr stderr

int printf(const char* format, ...);
int fprintf(FILE* stream, const char* format, ...);
int dprintf(int fd, const char* format, ...);
int sprintf(char* str, const char* format, ...);
int snprintf(char* str, size_t size, const char* format, ...);

int vprintf(const char* format, va_list ap);
int vfprintf(FILE* stream, const char* format, va_list ap);
int vdprintf(int fd, const char* format, va_list ap);
int vsprintf(char* str, const char* format, va_list ap);
int vsnprintf(char* str, size_t size, const char* format, va_list ap);

FILE* fopen(const char* pathname, const char* mode);
FILE* fdopen(int fd, const char* mode);
void fclose(FILE* stream);

int fgetc(FILE* stream);
int getc(FILE* stream);
int getchar(void);
void fputc(char c, FILE* stream);
int putc(int c, FILE* stream);
int putchar(int c);
char* fgets(char* s, int size, FILE* stream);
int ungetc(int c, FILE* stream);
int fscanf(FILE* stream, const char* fmt, ...);
int sscanf(const char* str, const char* format, ...);
int vsscanf(const char* str, const char* format, va_list ap);

long ftell(FILE* stream);
int fseek(FILE* stream, long offset, int whence);
void rewind(FILE* stream);
int fgetpos(FILE* stream, fpos_t pos);
int fsetpos(FILE* stream, const fpos_t pos);

size_t fread(void* ptr, size_t size, size_t nmemb, FILE* stream);
size_t fwrite(const void* ptr, size_t size, size_t nmemb, FILE* stream);
int fflush(FILE* stream);

int feof(FILE* stream);
int ferror(FILE* stream);
void clearerr(FILE* stream);

int remove(const char* pathname);
int access(const char* pathname, int mode);
