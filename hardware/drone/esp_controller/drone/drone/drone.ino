#include <WiFi.h>
#include <WiFiUdp.h>

#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/spi_slave.h"
#include "driver/gpio.h"

#include "../../common/spi_link.h"

// ========= User config =========
static const char *DRONE_SSID_PREFIX = "RADCLOFPV_"; // scan for this
static const char *DRONE_SSID = "";                 // if non-empty, connect to this exact SSID
static const char *DRONE_PASS = "";                 // typically open
static IPAddress DRONE_IP(192, 168, 0, 1);
static const uint16_t DRONE_UDP_PORT = 40000;

// Mirror what the phone uses (see hardware/drone/controller/drone.py).
static const uint16_t HB_SRC_PORT = 6000;
static const uint16_t CTRL_SRC_PORT = 5010;

// SPI pins (slave). Recommend wiring to the uplink ESP32 SPI master:
//   SCLK=18, MOSI=23, MISO=19, CS=5
// These are VSPI defaults on many devkits.
static const int PIN_SPI_SCLK = 18;
static const int PIN_SPI_MOSI = 23;
static const int PIN_SPI_MISO = 19;
static const int PIN_SPI_CS   = 5;

// Status LED: GPIO2 on many dev boards.
static const int PIN_LED = 2;

// ========= State =========
static WiFiUDP udp_hb;   // bound to 6000, sends heartbeat, receives telemetry+video
static WiFiUDP udp_ctrl; // bound to 5010, sends cc control

static volatile bool g_wifi_ok = false;

static const uint8_t HB_PAYLOAD[7] = {0x63, 0x63, 0x01, 0x00, 0x00, 0x00, 0x00};
static uint8_t g_ctrl_payload[15] = {0x63, 0x63, 0x0a, 0x00, 0x00, 0x08, 0x00, 0x66, 0x80, 0x80, 0x80, 0x80, 0x00, 0x00, 0x99};

static inline void ctrl_fix_checksum() {
  uint8_t x = g_ctrl_payload[8];
  uint8_t y = g_ctrl_payload[9];
  uint8_t z = g_ctrl_payload[10];
  uint8_t w = g_ctrl_payload[11];
  uint8_t f = g_ctrl_payload[12];
  g_ctrl_payload[13] = x ^ y ^ z ^ w ^ f;
  g_ctrl_payload[14] = 0x99;
}

// Video datagrams to forward over SPI (raw bytes, no processing).
// Keep this small; uplink polls aggressively.
static QueueHandle_t g_video_q = nullptr;

struct VideoChunk {
  uint16_t len;
  uint8_t  data[1500];
};

// SPI buffers (DMA-capable) for fixed-length transactions.
static uint8_t *g_spi_rx = nullptr;
static uint8_t *g_spi_tx = nullptr;

static void led_set(bool on) {
  digitalWrite(PIN_LED, on ? HIGH : LOW);
}

static void led_task(void *) {
  while (true) {
    if (!g_wifi_ok) {
      // blink at 2 Hz
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

static void wifi_connect_loop() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  while (true) {
    if (WiFi.status() == WL_CONNECTED) {
      g_wifi_ok = true;
      return;
    }
    g_wifi_ok = false;

    // If DRONE_SSID is set, connect directly; else scan for any RADCLOFPV_*.
    String target;
    if (DRONE_SSID && DRONE_SSID[0]) {
      target = DRONE_SSID;
    } else {
      int n = WiFi.scanNetworks(false, true);
      for (int i = 0; i < n; i++) {
        String ssid = WiFi.SSID(i);
        if (ssid.startsWith(DRONE_SSID_PREFIX)) {
          target = ssid;
          break;
        }
      }
      WiFi.scanDelete();
    }

    if (target.length() == 0) {
      delay(500);
      continue;
    }

    if (DRONE_PASS && DRONE_PASS[0]) WiFi.begin(target.c_str(), DRONE_PASS);
    else WiFi.begin(target.c_str());

    uint32_t t0 = millis();
    while (millis() - t0 < 6000) {
      if (WiFi.status() == WL_CONNECTED) {
        g_wifi_ok = true;
        return;
      }
      delay(100);
    }
    WiFi.disconnect(false, false);
    delay(200);
  }
}

static void hb_task(void *) {
  while (true) {
    if (g_wifi_ok) {
      udp_hb.beginPacket(DRONE_IP, DRONE_UDP_PORT);
      udp_hb.write(HB_PAYLOAD, sizeof(HB_PAYLOAD));
      udp_hb.endPacket();
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

static void ctrl_task(void *) {
  // ~22.3 Hz
  const TickType_t dt = pdMS_TO_TICKS(45);
  while (true) {
    if (g_wifi_ok) {
      ctrl_fix_checksum();
      udp_ctrl.beginPacket(DRONE_IP, DRONE_UDP_PORT);
      udp_ctrl.write(g_ctrl_payload, sizeof(g_ctrl_payload));
      udp_ctrl.endPacket();
    }
    vTaskDelay(dt);
  }
}

static void rx_task(void *) {
  // Receive on :6000 (telemetry + video). Forward UDP src=7070 as raw bytes to SPI.
  while (true) {
    if (!g_wifi_ok) {
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }
    int n = udp_hb.parsePacket();
    if (n <= 0) {
      vTaskDelay(pdMS_TO_TICKS(1));
      continue;
    }
    IPAddress from = udp_hb.remoteIP();
    uint16_t src_port = udp_hb.remotePort();
    if (from != DRONE_IP) {
      // Drain.
      while (n-- > 0) udp_hb.read();
      continue;
    }

    if (src_port == 7070) {
      VideoChunk *vc = (VideoChunk *)malloc(sizeof(VideoChunk));
      if (!vc) {
        while (n-- > 0) udp_hb.read();
        continue;
      }
      if (n > (int)sizeof(vc->data)) n = sizeof(vc->data);
      vc->len = (uint16_t)n;
      int r = udp_hb.read(vc->data, n);
      if (r < 0) r = 0;
      vc->len = (uint16_t)r;
      if (vc->len > 0) {
        // Drop if queue is full.
        if (xQueueSend(g_video_q, &vc, 0) != pdTRUE) {
          free(vc);
        }
      } else {
        free(vc);
      }
    } else {
      // Drain non-video.
      while (n-- > 0) udp_hb.read();
    }
  }
}

static void spi_slave_task(void *) {
  spi_bus_config_t buscfg{};
  buscfg.mosi_io_num = PIN_SPI_MOSI;
  buscfg.miso_io_num = PIN_SPI_MISO;
  buscfg.sclk_io_num = PIN_SPI_SCLK;
  buscfg.quadwp_io_num = -1;
  buscfg.quadhd_io_num = -1;
  buscfg.max_transfer_sz = SPI_XFER_BYTES;

  spi_slave_interface_config_t slvcfg{};
  slvcfg.spics_io_num = PIN_SPI_CS;
  slvcfg.mode = 0;
  slvcfg.queue_size = 2;
  slvcfg.flags = 0;

  // Arduino core initializes SPI flash on SPI1; use VSPI/HSPI for user.
  esp_err_t rc = spi_slave_initialize(VSPI_HOST, &buscfg, &slvcfg, SPI_DMA_CH_AUTO);
  if (rc != ESP_OK) {
    // Hard fail.
    while (true) vTaskDelay(pdMS_TO_TICKS(1000));
  }

  spi_slave_transaction_t t{};
  t.length = SPI_XFER_BYTES * 8;
  t.rx_buffer = g_spi_rx;
  t.tx_buffer = g_spi_tx;

  while (true) {
    // Prepare TX: either next video chunk, or idle.
    memset(g_spi_tx, 0, SPI_XFER_BYTES);
    VideoChunk *vc = nullptr;
    if (xQueueReceive(g_video_q, &vc, 0) == pdTRUE && vc) {
      uint16_t n = vc->len;
      if (n > (SPI_XFER_BYTES - SPI_HDR_BYTES)) n = (SPI_XFER_BYTES - SPI_HDR_BYTES);
      spi_hdr_write(g_spi_tx, SPI_MAGIC_RESP, SPI_MSG_VIDEO, n);
      memcpy(g_spi_tx + SPI_HDR_BYTES, vc->data, n);
      free(vc);
    } else {
      spi_hdr_write(g_spi_tx, SPI_MAGIC_RESP, SPI_MSG_NONE, 0);
    }

    // Clear RX before transaction.
    memset(g_spi_rx, 0, SPI_XFER_BYTES);
    rc = spi_slave_transmit(VSPI_HOST, &t, pdMS_TO_TICKS(50));
    if (rc != ESP_OK) continue;

    // Parse RX for command.
    if (g_spi_rx[0] != SPI_MAGIC_REQ) continue;
    uint8_t typ = g_spi_rx[1];
    uint16_t len = spi_hdr_len(g_spi_rx);
    if (len > (SPI_XFER_BYTES - SPI_HDR_BYTES)) continue;
    const uint8_t *pay = g_spi_rx + SPI_HDR_BYTES;

    if (typ == SPI_MSG_SET_CTRL) {
      if (len == 15) {
        memcpy(g_ctrl_payload, pay, 15);
      }
    } else if (typ == SPI_MSG_NEUTRAL) {
      // Reset to neutral.
      g_ctrl_payload[8] = 0x80;
      g_ctrl_payload[9] = 0x80;
      g_ctrl_payload[10] = 0x80;
      g_ctrl_payload[11] = 0x80;
      g_ctrl_payload[12] = 0x00;
    } else if (typ == SPI_MSG_PULSE_FLAG) {
      if (len >= 3) {
        uint8_t flag = pay[0];
        uint16_t dur_ms = (uint16_t)pay[1] | ((uint16_t)pay[2] << 8);
        // Set flag for dur_ms, then clear.
        g_ctrl_payload[12] = flag;
        ctrl_fix_checksum();
        vTaskDelay(pdMS_TO_TICKS(dur_ms));
        g_ctrl_payload[12] = 0x00;
      }
    }
  }
}

void setup() {
  pinMode(PIN_LED, OUTPUT);
  led_set(false);
  Serial.begin(921600);

  g_video_q = xQueueCreate(8, sizeof(void *));

  // DMA-capable buffers for SPI.
  g_spi_rx = (uint8_t *)heap_caps_malloc(SPI_XFER_BYTES, MALLOC_CAP_DMA);
  g_spi_tx = (uint8_t *)heap_caps_malloc(SPI_XFER_BYTES, MALLOC_CAP_DMA);
  if (!g_spi_rx || !g_spi_tx) {
    while (true) delay(1000);
  }

  xTaskCreatePinnedToCore(led_task, "led", 2048, nullptr, 1, nullptr, 1);

  wifi_connect_loop();

  udp_hb.begin(HB_SRC_PORT);
  udp_ctrl.begin(CTRL_SRC_PORT);

  xTaskCreatePinnedToCore(hb_task, "hb", 2048, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(ctrl_task, "ctrl", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(rx_task, "rx", 4096, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(spi_slave_task, "spi", 4096, nullptr, 3, nullptr, 0);
}

void loop() {
  // Keep Wi-Fi alive; if disconnected, attempt reconnect forever.
  if (WiFi.status() != WL_CONNECTED) {
    g_wifi_ok = false;
    WiFi.disconnect(false, false);
    delay(200);
    wifi_connect_loop();
  }
  delay(200);
}

