#pragma once

#include <stdint.h>

// Minimal framing over SPI.
//
// Uplink ESP32 is SPI master.
// Drone ESP32 is SPI slave.
//
// Master sends a request header; slave responds with a response header + payload.
// Transactions are fixed-size on the wire (SPI_XFER_BYTES), but only the first
// (SPI_HDR_BYTES + len) bytes are meaningful.

// Must match on both sides. Keep <= 4096 for ESP32 DMA.
#ifndef SPI_XFER_BYTES
#define SPI_XFER_BYTES 2048
#endif

#define SPI_MAGIC_REQ 0xC3
#define SPI_MAGIC_RESP 0xD5

enum SpiMsgType : uint8_t {
  // Master->Slave
  SPI_MSG_NONE = 0x00,
  SPI_MSG_SET_CTRL = 0x10,   // payload: 15 bytes (cc 0x000a packet)
  SPI_MSG_PULSE_FLAG = 0x11, // payload: u8 flag, u16le duration_ms
  SPI_MSG_NEUTRAL = 0x12,    // payload: empty

  // Slave->Master
  SPI_MSG_VIDEO = 0x01, // payload: raw UDP datagram bytes (typically from UDP src=7070)
};

// Header is always 4 bytes:
//   magic (1), type (1), len_le (2)
#define SPI_HDR_BYTES 4

static inline void spi_hdr_write(uint8_t *buf, uint8_t magic, uint8_t type, uint16_t len) {
  buf[0] = magic;
  buf[1] = type;
  buf[2] = (uint8_t)(len & 0xFF);
  buf[3] = (uint8_t)((len >> 8) & 0xFF);
}

static inline uint16_t spi_hdr_len(const uint8_t *buf) { return (uint16_t)buf[2] | ((uint16_t)buf[3] << 8); }

