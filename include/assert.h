#pragma once

void _assert_fail(const char* expr, const char* file, int line);

#define assert(expr) ((expr) ? ((void)0) : _assert_fail(#expr, __FILE__, __LINE__))