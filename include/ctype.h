#pragma once

#define __LITTLE_ENDIAN 1234
#define __BIG_ENDIAN    4321
#define __PDP_ENDIAN    3412

#define __BYTE_ORDER __LITTLE_ENDIAN
#define __FLOAT_WORD_ORDER __BYTE_ORDER
#define __LONG_LONG_PAIR(HI, LO) LO, HI

int toupper(int c);
int tolower(int c);
