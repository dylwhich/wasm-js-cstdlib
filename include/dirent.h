#pragma once

typedef struct
{
} DIR;

struct dirent {
    unsigned short int d_reclen;
    unsigned char d_type;
    char d_name[256];
};

DIR* opendir(const char* name);
DIR* fdopendir(int fd);
struct dirent* readdir(DIR* dir);
int closedir(DIR* dirp);
