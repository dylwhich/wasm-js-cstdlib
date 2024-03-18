#pragma once

#include <stddef.h>
#include <malloc.h>

extern void exit(int status);

int abs(int i);
long labs(long i);
long long llabs(long long i);

int atoi(const char* nptr);
long atol(const char* nptr);
long long atoll(const char* nptr);

char* getenv(const char* name);

void qsort(void* base, size_t nmemb, size_t size, int (*compar)(const void*, const void*));

int rand(void);
void srand(unsigned int seed);

void* alloca(size_t size);

double strtod(const char* nptr, char** endptr);
float strtof(const char* nptr, char** endptr);
