## System design

- Two ESP32s sit on a breadboard together. There is an SPI link between them (recommend the right pins to use for this).
- One ESP32 ("drone") is in STA mode and is connected to the drone.
- The other ESP32 ("uplink") is in STA mode and is connected to the laptop (same network; use StanfordVisitor and set MAC address to f4:4e:b4:a6:58:eb, should work). The laptop's LAN address is 10.16.137.249. We will have a web server running on port 6767, which needs to be implemented.

- The drone ESP32 needs to do the following:
  - Connect to drone. If disconnected, always be on the search. Flash GPIO2 when disconnected at 2 Hz and otherwise leave it on.
  - Send commands/receive video frames over UDP. Reference `hardware/drone/controller/drone.py` and `hardware/drone/controller/web.py` for some usage examples. Note that the heartbeat should be processed automatically on hardware; set a task for this or something.
  - When receiving a UDP JPEG frame, send the data over SPI (do NO processing, just send raw bytes for max efficiency. Maybe an RTOS task for async thread? Or something? This needs to be really fast throughput) to the uplink ESP.
  - Should be able to receive commands over SPI from the uplink ESP as well, which should be transmitted to the drone. Use the @drone.py framework for control. Sending raw bytes is honestly feasible.

- The uplink ESP32 needs to do the following:
  - Connect to the laptop over Wi-Fi. If disconnected, also always be on the search. Use GPIO2 to indicate status similar to the drone ESP32.
  - Listen for commands from the Python webserver on port 6767 (raw bytes! websocket!) and forward them via SPI to the drone ESP32. Again, speed and minimal processing time is the priority. Simplicity is king.
  - Forward video frames from the drone ESP32 to the laptop.

- The python web server needs to do the following:
  - Expose an API where clients can view a WebRTC stream of the video.
  - Expose a websocket API where clients can control the drone.

Also make a thin, unstyled web client (similar to @web.py tbh) where we can view the video stream and control the drone.

## Wiring

SPI between ESP32s (recommend VSPI pins on both boards):
- SCLK: GPIO18
- MOSI: GPIO23 (uplink -> drone)
- MISO: GPIO19 (drone -> uplink)
- CS: GPIO5 (uplink drives)
- GND: common ground is required

Both boards use GPIO2 as a status LED:
- Blink at 2 Hz while Wi-Fi disconnected
- Solid ON while Wi-Fi connected

## Flashing

Drone ESP (STA to drone SSID):
- `cd esp_controller/drone && make flash PORT=/dev/ttyUSB0`

Uplink ESP (STA to StanfordVisitor):
- `cd esp_controller/uplink && make flash PORT=/dev/ttyUSB1`

## Server

Python server (TCP+UDP on port 6767):
- `cd esp_controller/server && uv run python server.py`

Open:
- `http://localhost:6767`
- `http://localhost:6767/health`
