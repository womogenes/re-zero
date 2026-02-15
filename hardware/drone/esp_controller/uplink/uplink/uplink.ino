#include <SPI.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "../../common/spi_link.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// ========= User config =========
// Note the space; your scan output shows this exact SSID.
static const char* UPLINK_SSID = "Stanford Visitor";
static const char* UPLINK_PASS = "";  // open? if not, set here

// Modal cloud WebSocket endpoint (device ingress).
// Set this to the hostname Modal prints after `modal deploy`, e.g.:
//   "<user>--drone.modal.run"  (no scheme, no path)
static const char* CLOUD_HOST = "tetracorp--drone.modal.run";
static const uint16_t CLOUD_PORT = 443;
static const char* CLOUD_PATH = "/ws/device/uplink";

// Set STA MAC address as requested.
// static const uint8_t UPLINK_STA_MAC[6] = {0xf4, 0x4e, 0xb4, 0xa6, 0x58, 0xeb};
static const uint8_t UPLINK_STA_MAC[6] = {0xBA, 0xDA, 0xE7, 0x85, 0x19, 0xEE};

// SPI pins (master). Recommend VSPI defaults:
//   SCLK=18, MOSI=23, MISO=19, CS=5
static const int PIN_SPI_SCLK = 18;
static const int PIN_SPI_MOSI = 23;
static const int PIN_SPI_MISO = 19;
static const int PIN_SPI_CS = 5;

static const int PIN_LED = 2;

// SPI clock; start conservative for breadboard wiring.
static const uint32_t SPI_HZ = 10 * 1000 * 1000;

// Diagnostics.
static const uint32_t SERIAL_BAUD = 921600;
static const uint32_t NET_DIAG_EVERY_MS = 5000;
static const uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000;

// WebSocket throughput guardrails: keep lwIP stable under load.
static const uint32_t WS_SEND_MAX_PER_LOOP = 8;
static const uint32_t WS_SEND_YIELD_MS = 2;

// NOTE: portal automation + periodic HTTP probes were removed because they were triggering
// lwIP asserts (`pbuf_free: p->ref > 0`) on ESP32 core 3.3.5. Keep this firmware focused
// on WSS + SPI forwarding.

// ========= State =========
static volatile bool g_wifi_ok = false;

static uint8_t g_spi_tx[SPI_XFER_BYTES];
static uint8_t g_spi_rx[SPI_XFER_BYTES];

static WebSocketsClient ws;
static volatile bool g_ws_ok = false;

struct WsVideoChunk {
  uint16_t len;
  uint8_t data[1500];
};

static QueueHandle_t g_ws_video_q = nullptr;

// At most one pending command at a time (simplicity > throughput).
static volatile bool g_cmd_pending = false;
static uint8_t g_cmd_type = 0;
static uint16_t g_cmd_len = 0;
static uint8_t g_cmd_pay[64];

static volatile uint32_t g_cmd_rx_n = 0;
static volatile uint8_t g_cmd_last_typ = 0;

static void led_set(bool on) { digitalWrite(PIN_LED, on ? HIGH : LOW); }

static const char* wifi_status_str(wl_status_t s) {
  switch (s) {
    case WL_IDLE_STATUS:
      return "IDLE";
    case WL_NO_SSID_AVAIL:
      return "NO_SSID";
    case WL_SCAN_COMPLETED:
      return "SCAN_DONE";
    case WL_CONNECTED:
      return "CONNECTED";
    case WL_CONNECT_FAILED:
      return "CONNECT_FAILED";
    case WL_CONNECTION_LOST:
      return "CONNECTION_LOST";
    case WL_DISCONNECTED:
      return "DISCONNECTED";
    default:
      return "UNKNOWN";
  }
}

static void print_net_info() {
  Serial.printf("[WIFI] ssid=%s rssi=%d status=%s\n",
                WiFi.SSID().c_str(), WiFi.RSSI(), wifi_status_str(WiFi.status()));
  Serial.printf("[WIFI] mac=%s\n", WiFi.macAddress().c_str());
  Serial.printf("[WIFI] ip=%s gw=%s mask=%s dns=%s\n",
                WiFi.localIP().toString().c_str(),
                WiFi.gatewayIP().toString().c_str(),
                WiFi.subnetMask().toString().c_str(),
                WiFi.dnsIP().toString().c_str());
}

static void scan_and_print() {
  Serial.println("[WIFI] scanning...");
  int n = WiFi.scanNetworks(/*async=*/false, /*hidden=*/true);
  Serial.printf("[WIFI] scan found %d networks\n", n);
  int limit = n > 15 ? 15 : n;
  for (int i = 0; i < limit; i++) {
    Serial.printf("  [%2d] %s  rssi=%d  ch=%d  bssid=%s  enc=%s\n",
                  i,
                  WiFi.SSID(i).c_str(),
                  WiFi.RSSI(i),
                  WiFi.channel(i),
                  WiFi.BSSIDstr(i).c_str(),
                  (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "open" : "enc");
  }
  WiFi.scanDelete();
}

static void led_task(void*) {
  while (true) {
    if (!g_wifi_ok) {
      led_set(true);
      vTaskDelay(pdMS_TO_TICKS(250));
      led_set(false);
      vTaskDelay(pdMS_TO_TICKS(250));
    } else {
      led_set(true);
      vTaskDelay(pdMS_TO_TICKS(500));
    }
  }
}

static bool pick_uplink_ap(uint8_t out_bssid[6], int* out_chan) {
  int n = WiFi.scanNetworks(/*async=*/false, /*hidden=*/true);
  int best_i = -1;
  int best_rssi = -9999;
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (s == UPLINK_SSID) {
      int r = WiFi.RSSI(i);
      if (r > best_rssi) {
        best_rssi = r;
        best_i = i;
      }
    }
  }
  if (best_i < 0) {
    WiFi.scanDelete();
    return false;
  }
  const uint8_t* b = WiFi.BSSID(best_i);
  if (b) memcpy(out_bssid, b, 6);
  *out_chan = WiFi.channel(best_i);
  Serial.printf("[WIFI] picked ap bssid=%s ch=%d rssi=%d\n",
                WiFi.BSSIDstr(best_i).c_str(), *out_chan, best_rssi);
  WiFi.scanDelete();
  return true;
}

static void wifi_event(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
      Serial.println("[EV] STA_START");
      break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[EV] STA_CONNECTED");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[EV] GOT_IP %s\n", WiFi.localIP().toString().c_str());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("[EV] DISCONNECTED reason=%u\n", info.wifi_sta_disconnected.reason);
      break;
    default:
      break;
  }
}

static void wifi_connect_loop() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.onEvent(wifi_event);
  // Set requested MAC before connect.
  esp_err_t mac_err = esp_wifi_set_mac(WIFI_IF_STA, (uint8_t*)UPLINK_STA_MAC);
  Serial.printf("[WIFI] set sta mac -> %02x:%02x:%02x:%02x:%02x:%02x (%s)\n",
                UPLINK_STA_MAC[0], UPLINK_STA_MAC[1], UPLINK_STA_MAC[2],
                UPLINK_STA_MAC[3], UPLINK_STA_MAC[4], UPLINK_STA_MAC[5],
                (mac_err == ESP_OK) ? "ok" : "err");

  while (true) {
    if (WiFi.status() == WL_CONNECTED) {
      g_wifi_ok = true;
      return;
    }
    g_wifi_ok = false;
    scan_and_print();
    uint8_t bssid[6] = {0};
    int chan = 0;
    if (!pick_uplink_ap(bssid, &chan)) {
      Serial.printf("[WIFI] target ssid not found (want: '%s')\n", UPLINK_SSID);
      delay(500);
      continue;
    }
    Serial.printf("[WIFI] connecting to ssid='%s' ...\n", UPLINK_SSID);
    WiFi.disconnect(true, false);
    delay(50);
    const char* pass = (UPLINK_PASS && UPLINK_PASS[0]) ? UPLINK_PASS : NULL;
    WiFi.begin(UPLINK_SSID, pass, chan, bssid, true);

    uint32_t t0 = millis();
    while (millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
      if (WiFi.status() == WL_CONNECTED) {
        g_wifi_ok = true;
        Serial.println("[WIFI] connected");
        print_net_info();
        return;
      }
      delay(100);
    }
    Serial.printf("[WIFI] connect timeout status=%s\n", wifi_status_str(WiFi.status()));
    WiFi.disconnect(false, false);
    delay(200);
  }
}

static void ws_event(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      g_ws_ok = true;
      Serial.printf("[WS] connected\n");
      break;
    case WStype_DISCONNECTED:
      g_ws_ok = false;
      Serial.println("[WS] disconnected");
      break;
    case WStype_BIN: {
      if (!payload || length < 1) break;
      uint8_t typ = payload[0];
      if (!(typ == 0x10 || typ == 0x11 || typ == 0x12)) break;
      uint16_t len = (uint16_t)(length - 1);
      if (len > sizeof(g_cmd_pay)) len = sizeof(g_cmd_pay);
      g_cmd_type = typ;
      g_cmd_len = len;
      if (len) memcpy((void*)g_cmd_pay, payload + 1, len);
      g_cmd_pending = true;
      g_cmd_last_typ = typ;
      g_cmd_rx_n++;
      break;
    }
    default:
      break;
  }
}

static void ws_task(void*) {
  ws.beginSSL(CLOUD_HOST, CLOUD_PORT, CLOUD_PATH);
  ws.onEvent(ws_event);
  ws.setReconnectInterval(2000);
  // Heartbeats have caused instability on some ESP32 core/lwIP combos; keep it off.
  // If you need keepalive, rely on TCP keepalive + app-level traffic.

  static uint8_t out[1 + 1500];

  while (true) {
    if (!g_wifi_ok || WiFi.status() != WL_CONNECTED) {
      g_ws_ok = false;
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }

    ws.loop();

    if (g_ws_ok && g_ws_video_q != nullptr) {
      WsVideoChunk c;
      uint32_t sent = 0;
      while (sent < WS_SEND_MAX_PER_LOOP && xQueueReceive(g_ws_video_q, &c, 0) == pdTRUE) {
        uint16_t n = c.len;
        if (n > sizeof(c.data)) n = sizeof(c.data);
        out[0] = 0x02;  // device video chunk (Modal protocol)
        memcpy(out + 1, c.data, n);
        ws.sendBIN(out, (size_t)(1 + n));
        ws.loop();
        sent++;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(WS_SEND_YIELD_MS));
  }
}

static void diag_task(void*) {
  while (true) {
    if (!g_wifi_ok || WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    Serial.printf("[STAT] ip=%s rssi=%d ws=%d q=%u heap=%u cmd_rx=%lu last=%02x\n",
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(),
                  (int)g_ws_ok,
                  (unsigned)(g_ws_video_q ? uxQueueMessagesWaiting(g_ws_video_q) : 0),
                  (unsigned)ESP.getFreeHeap(),
                  (unsigned long)g_cmd_rx_n,
                  (unsigned)g_cmd_last_typ);

    vTaskDelay(pdMS_TO_TICKS(NET_DIAG_EVERY_MS));
  }
}

static void spi_poll_task(void*) {
  SPIClass spi(VSPI);
  spi.begin(PIN_SPI_SCLK, PIN_SPI_MISO, PIN_SPI_MOSI, PIN_SPI_CS);
  pinMode(PIN_SPI_CS, OUTPUT);
  digitalWrite(PIN_SPI_CS, HIGH);

  // Poll loop: each iteration is one fixed-size full-duplex transaction.
  while (true) {
    // Build request.
    memset(g_spi_tx, 0, sizeof(g_spi_tx));
    uint8_t typ = SPI_MSG_NONE;
    uint16_t len = 0;
    if (g_cmd_pending) {
      typ = g_cmd_type;
      len = g_cmd_len;
      if (len > (SPI_XFER_BYTES - SPI_HDR_BYTES)) len = (SPI_XFER_BYTES - SPI_HDR_BYTES);
      g_cmd_pending = false;
    }
    spi_hdr_write(g_spi_tx, SPI_MAGIC_REQ, typ, len);
    if (typ != SPI_MSG_NONE && len) memcpy(g_spi_tx + SPI_HDR_BYTES, (const void*)g_cmd_pay, len);

    // Transfer.
    memset(g_spi_rx, 0, sizeof(g_spi_rx));
    spi.beginTransaction(SPISettings(SPI_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(PIN_SPI_CS, LOW);
    spi.transferBytes(g_spi_tx, g_spi_rx, SPI_XFER_BYTES);
    digitalWrite(PIN_SPI_CS, HIGH);
    spi.endTransaction();

    // Parse response.
    if (g_spi_rx[0] == SPI_MAGIC_RESP) {
      uint8_t rtyp = g_spi_rx[1];
      uint16_t rlen = spi_hdr_len(g_spi_rx);
      if (rlen <= (SPI_XFER_BYTES - SPI_HDR_BYTES) && rtyp == SPI_MSG_VIDEO && rlen > 0) {
        // Forward raw bytes to cloud over WebSocket (as a chunk stream).
        if (g_ws_video_q != nullptr) {
          WsVideoChunk c;
          uint16_t n = rlen;
          if (n > sizeof(c.data)) n = sizeof(c.data);
          c.len = n;
          memcpy(c.data, g_spi_rx + SPI_HDR_BYTES, n);
          if (xQueueSend(g_ws_video_q, &c, 0) != pdTRUE) {
            // Drop oldest then try once more.
            WsVideoChunk drop;
            (void)xQueueReceive(g_ws_video_q, &drop, 0);
            (void)xQueueSend(g_ws_video_q, &c, 0);
          }
        }
      }
    }

    // Poll fast; yield a bit.
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

void setup() {
  pinMode(PIN_LED, OUTPUT);
  led_set(false);
  Serial.begin(SERIAL_BAUD);
  delay(200);
  Serial.println();
  Serial.println("uplink: boot");

  xTaskCreatePinnedToCore(led_task, "led", 2048, nullptr, 1, nullptr, 1);

  wifi_connect_loop();
  Serial.printf("[WS] target wss://%s%s\n", CLOUD_HOST, CLOUD_PATH);

  g_ws_video_q = xQueueCreate(24, sizeof(WsVideoChunk));
  xTaskCreatePinnedToCore(ws_task, "ws", 8192, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(diag_task, "diag", 4096, nullptr, 1, nullptr, 0);
  xTaskCreatePinnedToCore(spi_poll_task, "spi_poll", 4096, nullptr, 3, nullptr, 1);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    g_wifi_ok = false;
    WiFi.disconnect(false, false);
    delay(200);
    wifi_connect_loop();
  }
  delay(200);
}
