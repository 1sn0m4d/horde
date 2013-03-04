# Horde LZ4 Extension for PHP #

This extension allows LZ4 compression.

Documentation for LZ4 can be found at [» http://code.google.com/p/lz4/](http://code.google.com/p/lz4/).

## Build ##

    % phpize
    % ./configure
    % make
    % make install

## Configration ##

php.ini:

    extension=horde_lz4.so

## Function ##

* horde\_lz4\_compress — LZ4 compression
* horde\_lz4\_uncompress — LZ4 decompression

### horde\_lz4\_compress — LZ4 compression ###

#### Description ####

string **horde\_lz4\_compress** (string _$data_ [, bool _$high_ = false, string _$extra_ = NULL ])

LZ4 compression.

#### Pameters ####

* _data_

  The string to compress.

* _high_

  High Compression Mode.

* _extra_

  Prefix to compressed data.

#### Return Values ####

Returns the compressed data or FALSE if an error occurred.


### horde\_lz4\_uncompress — LZ4 decompression ###

#### Description ####

string **horde\_lz4\_uncompress** (string _$data_ [, long _$maxsize_ = -1, long _$offset_ = -1 ])

LZ4 decompression.

#### Pameters ####

* _data_

  The compressed string.

* _maxsize_

  Allocate size output data.

* _offset_

  Offset to decompressed data.

#### Return Values ####

Returns the decompressed data or FALSE if an error occurred.

## Examples ##

    $compressed = horde_lz4_compress('test');
    $compressed = lz4_compress('test', false, 'PREFIX');

    $uncompressed = horde_lz4_uncompress($compressed_data);
    $uncompressed = horde_lz4_uncompress($compressed_data, 256, 6);
