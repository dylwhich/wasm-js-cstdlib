#pragma once

#include <stddef.h>

int memcmp(const void* s1, const void* s2, size_t n);
void* memmove(void* dest, const void* src, size_t n);
void* memcpy(void* dest, const void* src, size_t n);
void* memset(void* s, char c, size_t n);

char* strcat(char* dst, const char* src);
char* strchr(const char* s, int c);
char* strrchr(const char* s, int c);
int strcmp(const char* s1, const char* s2);
char* strcpy(char* dst, const char* src);
char* strdup(const char* src);
size_t strlen(const char* str);
int strcasecmp(const char* s1, const char* s2);
int strncasecmp(const char* s1, const char* s2, size_t n);
int strncmp(const char* s1, const char* s2, size_t n);
int strncpy(char* dst, const char* src, size_t n);
char* strstr(const char* haystack, const char* needle);

