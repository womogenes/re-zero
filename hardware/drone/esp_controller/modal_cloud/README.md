# Modal Cloud Server (Binary Only)

This replaces the local `esp_controller/server/server.py` with a hosted Modal app.

## Deploy

```bash
cd esp_controller/modal_cloud
modal deploy drone_backend.py
```

Modal will print a URL for the web app label `drone`.

## Web UI

Open the Modal URL in a browser. It:
- receives video as binary WebSocket messages (JPEG frames)
- sends control commands as binary WebSocket messages

## WebSocket Endpoints

- UI connects to: `/ws/ui/{device}`
  - UI -> cloud: raw command bytes (`0x10...`, `0x11...`, `0x12`)
  - cloud -> UI: `0x01 + JPEG_BYTES`

- Device connects to: `/ws/device/{device}`
  - device -> cloud: `0x02 + VIDEO_CHUNK_BYTES` (forwarded raw UDP payload bytes, not full JPEG)
  - cloud -> device: raw command bytes (`0x10...`, `0x11...`, `0x12`)

## Next Step (Firmware)

Update the uplink ESP32 to:
- maintain a WebSocket client connection to Modal `/ws/device/uplink`
- forward each SPI `SPI_MSG_VIDEO` payload as a WS binary message with a `0x02` prefix
- apply received command bytes to its existing SPI control path
