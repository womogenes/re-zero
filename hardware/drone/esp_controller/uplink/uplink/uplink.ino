#include <HTTPClient.h>
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

static bool g_portal_done = false;

static bool http_get_head(const char* url, String* out_firstline, String* out_location) {
  if (out_firstline) *out_firstline = "";
  if (out_location) *out_location = "";

  HTTPClient http;
  WiFiClient c;
  const char* hdrs[] = {"Location"};
  http.collectHeaders(hdrs, 1);
  if (!http.begin(c, url)) return false;
  http.setTimeout(2500);
  int code = http.GET();
  if (out_firstline) *out_firstline = String(code);
  if (code > 0) {
    if (out_location) *out_location = http.header("Location");
  }
  http.end();
  return (code > 0);
}

static bool http_get_text(const char* url, int* out_code, String* out_location, String* out_body, size_t body_cap = 256) {
  if (out_code) *out_code = 0;
  if (out_location) *out_location = "";
  if (out_body) *out_body = "";

  HTTPClient http;
  WiFiClient c;
  const char* hdrs[] = {"Location"};
  http.collectHeaders(hdrs, 1);
  if (!http.begin(c, url)) return false;
  http.setTimeout(3500);
  int code = http.GET();
  if (out_code) *out_code = code;
  if (code > 0) {
    if (out_location) *out_location = http.header("Location");
    if (out_body) {
      String b = http.getString();
      if (b.length() > body_cap) b = b.substring(0, body_cap);
      *out_body = b;
    }
  }
  http.end();
  return (code > 0);
}

static String qparam(const String& url, const char* key) {
  int q = url.indexOf('?');
  if (q < 0) return "";
  String qs = url.substring(q + 1);
  String k = String(key) + "=";
  int i = qs.indexOf(k);
  if (i < 0) return "";
  int s = i + k.length();
  int e = qs.indexOf('&', s);
  if (e < 0) e = qs.length();
  return qs.substring(s, e);
}

static bool portal_accept_from_location(const String& loc) {
  if (loc.length() == 0) return false;
  if (!loc.startsWith("https://portal.mist.com/logon?")) return false;

  String ap_mac = qparam(loc, "ap_mac");
  String client_mac = qparam(loc, "client_mac");
  String wlan_id = qparam(loc, "wlan_id");
  String url = qparam(loc, "url");
  if (ap_mac.length() == 0 || client_mac.length() == 0 || wlan_id.length() == 0) {
    Serial.printf("[PORTAL] missing params ap_mac=%d client_mac=%d wlan_id=%d\n",
                  ap_mac.length(), client_mac.length(), wlan_id.length());
    return false;
  }

  String body = "ap_mac=" + ap_mac + "&client_mac=" + client_mac + "&wlan_id=" + wlan_id;
  if (url.length()) body += "&url=" + url;
  body += "&tos=true&auth_method=passphrase";

  WiFiClientSecure sc;
  sc.setInsecure();  // captive portal; avoid CA management for now
  HTTPClient https;
  https.setTimeout(5000);
  if (!https.begin(sc, loc)) {
    Serial.println("[PORTAL] https begin failed");
    return false;
  }
  https.addHeader("Content-Type", "application/x-www-form-urlencoded");
  https.addHeader("User-Agent", "esp32-uplink");
  int code = https.POST((uint8_t*)body.c_str(), body.length());
  Serial.printf("[PORTAL] POST code=%d\n", code);
  https.end();
  return (code > 0);
}

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
  ws.enableHeartbeat(15000, 3000, 2);

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
      while (xQueueReceive(g_ws_video_q, &c, 0) == pdTRUE) {
        uint16_t n = c.len;
        if (n > sizeof(c.data)) n = sizeof(c.data);
        out[0] = 0x02;  // device video chunk (Modal protocol)
        memcpy(out + 1, c.data, n);
        ws.sendBIN(out, (size_t)(1 + n));
        ws.loop();
      }
    }

    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

static void net_diag_task(void*) {
  while (true) {
    if (!g_wifi_ok || WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    print_net_info();

    IPAddress resolved;
    bool dns_ok = WiFi.hostByName("example.com", resolved);
    Serial.printf("[NET] dns example.com -> %s (%s)\n",
                  resolved.toString().c_str(),
                  dns_ok ? "ok" : "fail");

    // Internet-ish reachability: TCP connect probes (not ICMP ping).
    // Prefer port 80 since it's typically allowed when anything is.
    {
      WiFiClient c;
      c.setTimeout(1200);
      IPAddress ip(1, 1, 1, 1);
      bool ok = c.connect(ip, 80);
      Serial.printf("[NET] tcp public %s:%u -> %s\n", ip.toString().c_str(), 80, ok ? "ok" : "fail");
      c.stop();
    }

    // HTTP probe (gives signal even if raw IP connect is weird).
    {
      WiFiClient c;
      c.setTimeout(1500);
      bool ok = c.connect("example.com", 80);
      Serial.printf("[NET] http example.com:80 -> %s\n", ok ? "ok" : "fail");
      if (ok) {
        c.print("GET / HTTP/1.0\r\nHost: example.com\r\nConnection: close\r\n\r\n");
        String line = c.readStringUntil('\n');
        line.trim();
        Serial.printf("[NET] http firstline: %s\n", line.c_str());
      }
      c.stop();
    }

    // "Curl" probes to see if we're still in a walled-garden / portal redirect.
    {
      String first, loc;
      http_get_head("http://kv.wfeng.dev/hello", &first, &loc);
      Serial.printf("[CURL] http://kv.wfeng.dev/hello -> %s\n", first.c_str());
      if (loc.length()) Serial.printf("[CURL] location: %s\n", loc.c_str());

      // If we got redirected to Mist portal, attempt TOS accept once per boot.
      if (!g_portal_done && loc.startsWith("https://portal.mist.com/logon?")) {
        Serial.println("[PORTAL] detected, attempting auto-accept...");
        g_portal_done = true;
        portal_accept_from_location(loc);
      }

      first = "";
      loc = "";
      http_get_head("http://icanhazip.com/", &first, &loc);
      Serial.printf("[CURL] http://icanhazip.com/ -> %s\n", first.c_str());
      if (loc.length()) Serial.printf("[CURL] location: %s\n", loc.c_str());

      int code = 0;
      String body;
      String loc2;
      if (http_get_text("http://icanhazip.com/", &code, &loc2, &body, 128)) {
        body.trim();
        Serial.printf("[CURL] icanhazip body: %s\n", body.c_str());
      }
    }
    Serial.printf("[WS] ok=%d q=%u target=%s\n",
                  (int)g_ws_ok,
                  (unsigned)(g_ws_video_q ? uxQueueMessagesWaiting(g_ws_video_q) : 0),
                  CLOUD_HOST);

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
          (void)xQueueSend(g_ws_video_q, &c, 0);
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

  g_ws_video_q = xQueueCreate(6, sizeof(WsVideoChunk));
  xTaskCreatePinnedToCore(ws_task, "ws", 8192, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(net_diag_task, "net_diag", 4096, nullptr, 1, nullptr, 0);
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
