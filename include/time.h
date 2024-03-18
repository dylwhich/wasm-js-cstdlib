#pragma once

#define CLOCK_MONOTONIC 1
#define CLOCK_REALTIME 2

struct timespec
{
    long int tv_sec;
    long int tv_nsec;
};

typedef int clockid_t;
typedef long time_t;

int clock_gettime(clockid_t clockid, struct timespec *tp);
int nanosleep(const struct timespec *req, struct timespec* rem);
time_t time(time_t* tloc);
