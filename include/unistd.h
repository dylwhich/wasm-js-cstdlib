#pragma once

#include <stddef.h>
#include <sys/types.h>

typedef long useconds_t;
extern int usleep(useconds_t usec);

ssize_t read(int fd, void* buf, size_t count);
ssize_t write(int fd, const void* buf, size_t count);
void close(int fd);
