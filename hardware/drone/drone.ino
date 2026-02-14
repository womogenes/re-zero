/*
  ESP32 protocol probe for toy drone reverse engineering.

  What it does:
  1) Scans BLE advertisements and prints address/name/RSSI.
  2) Enables Wi-Fi promiscuous mode and counts observed 802.11 frames.

  Interpretation:
  - If the drone/controller traffic is BLE, you should see repeating device
    addresses while the controller is powered and sticks are moved.
  - If BLE and Wi-Fi look mostly empty, the control link is likely proprietary
    2.4 GHz (not directly decodable with ESP32 radio hardware alone).
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <esp_wifi.h>
#include <WiFi.h>

static BLEScan *g_ble_scan = nullptr;
static volatile uint32_t g_wifi_packets = 0;
static uint32_t g_last_print_ms = 0;

static void wifi_sniffer(void *buf, wifi_promiscuous_pkt_type_t type) {
  (void)buf;
  (void)type;
  g_wifi_packets++;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=== ESP32 Drone Protocol Probe ===");

  BLEDevice::init("");
  g_ble_scan = BLEDevice::getScan();
  g_ble_scan->setActiveScan(true);
  g_ble_scan->setInterval(80);
  g_ble_scan->setWindow(60);

  WiFi.mode(WIFI_MODE_NULL);
  esp_wifi_set_promiscuous(false);
  esp_wifi_set_promiscuous_rx_cb(wifi_sniffer);
  esp_wifi_set_promiscuous(true);

  g_last_print_ms = millis();
}

void loop() {
  BLEScanResults *results = g_ble_scan->start(2, false);
  if (results == nullptr) {
    Serial.println("\nBLE scan failed");
    delay(250);
    return;
  }
  int count = results->getCount();

  Serial.printf("\nBLE results: %d device(s)\n", count);
  for (int i = 0; i < count; i++) {
    BLEAdvertisedDevice d = results->getDevice(i);
    String name = d.haveName() ? d.getName().c_str() : "";
    Serial.printf(
        "  [%02d] addr=%s rssi=%d name=%s\n",
        i,
        d.getAddress().toString().c_str(),
        d.getRSSI(),
        name.c_str());
  }
  g_ble_scan->clearResults();

  uint32_t now = millis();
  if (now - g_last_print_ms >= 2000) {
    uint32_t pkts = g_wifi_packets;
    g_wifi_packets = 0;
    Serial.printf("Wi-Fi promisc packets/2s: %lu\n", (unsigned long)pkts);
    g_last_print_ms = now;
  }
}
