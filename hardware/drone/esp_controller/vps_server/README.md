# VPS Server (HTTP :80 + UDP video :6767)

Public IP: `52.53.149.188`

## What runs where

- Browser UI:
  - HTTP `GET /` on port `80`
  - WebSocket `GET /ws/ui/uplink` on port `80` (binary)
- Uplink ESP32:
  - UDP -> server `52.53.149.188:6767`
    - sends `0x02 + video_chunk_bytes`
    - receives raw command bytes `0x10...`, `0x11...`, `0x12...` from the same server

## Install + Run (Ubuntu 24.04)

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv
```

Then:

```bash
cd esp_controller/vps_server
uv sync
sudo -E uv run uvicorn server:app --host 0.0.0.0 --port 80
```

Open:
- `http://52.53.149.188/`
- `http://52.53.149.188/health`

## Firewall / Security Groups

Allow inbound:
- TCP `80`
- UDP `6767`

