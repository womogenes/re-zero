/*
  Controller pin probe for ESP32.

  Goal:
  - Classify a single unknown controller IC pin as:
    * mostly static
    * analog-like (joystick wiper)
    * digital activity (button scan / data / clock-like toggling)

  Wiring:
  - ESP32 GND <-> controller battery negative.
  - Controller test pin -> (10k series resistor) -> ESP32 GPIO34.
  - Do NOT connect probe pin directly to battery positive.

  Usage:
  1) Power controller.
  2) Touch/solder probe to one IC pin at a time.
  3) Move sticks / press buttons and observe reported changes.
*/

#include <Arduino.h>

static constexpr int PROBE_PIN = 34;       // ADC-capable, input-only
static constexpr uint32_t FAST_WINDOW_US = 50000;   // 50 ms fast digital window
static constexpr uint32_t REPORT_WINDOW_MS = 2000;  // catches ~1-3 Hz blinking
static constexpr int ANALOG_SAMPLES = 96;
static constexpr int ADC_BUF_MAX = 1024;
static constexpr uint8_t PWM_RES_BITS = 8;

struct ControlPwm {
  uint8_t pin;
  uint32_t freq_hz;
  uint8_t duty_8bit;
};

// Control/reference outputs. Jumper one of these pins to GPIO34 (via 10k) to validate detection.
static const ControlPwm kControlPwms[] = {
    {27, 2, 128},      // 2 Hz, 50%
    {26, 3, 128},      // 3 Hz, 50%
    {25, 50, 64},      // 50 Hz, 25%
    {33, 1000, 128},   // 1 kHz, 50%
};

struct DigitalStats {
  uint32_t samples = 0;
  uint32_t highs = 0;
  uint32_t edges = 0;
  int last_level = 0;
};

struct AnalogEdgeStats {
  uint32_t samples = 0;
  uint32_t edges = 0;
  int min_v = 4095;
  int max_v = 0;
  int mean_v = 0;
};

static void measureDigital(DigitalStats &s) {
  uint32_t start = micros();
  int prev = digitalRead(PROBE_PIN);
  s.last_level = prev;

  while ((uint32_t)(micros() - start) < FAST_WINDOW_US) {
    int cur = digitalRead(PROBE_PIN);
    s.samples++;
    s.highs += (cur != 0);
    s.edges += (cur != prev);
    prev = cur;
    s.last_level = cur;
  }
}

static void measureAnalogEdges(AnalogEdgeStats &s) {
  static uint16_t buf[ADC_BUF_MAX];

  uint32_t start = micros();
  int n = 0;
  uint32_t sum = 0;
  int amin = 4095;
  int amax = 0;

  while ((uint32_t)(micros() - start) < FAST_WINDOW_US && n < ADC_BUF_MAX) {
    int v = analogRead(PROBE_PIN);
    if (v < amin) amin = v;
    if (v > amax) amax = v;
    sum += (uint32_t)v;
    buf[n++] = (uint16_t)v;
  }

  s.samples = (uint32_t)n;
  s.min_v = (n > 0) ? amin : 0;
  s.max_v = (n > 0) ? amax : 0;
  s.mean_v = (n > 0) ? (int)(sum / (uint32_t)n) : 0;

  if (n < 2) {
    s.edges = 0;
    return;
  }

  int span = amax - amin;
  int thresh = amin + span / 2;
  int hyst = span / 16;
  if (hyst < 6) hyst = 6;

  int state = (buf[0] > thresh) ? 1 : 0;
  uint32_t edges = 0;
  for (int i = 1; i < n; i++) {
    int v = (int)buf[i];
    if (state == 0 && v > (thresh + hyst)) {
      state = 1;
      edges++;
    } else if (state == 1 && v < (thresh - hyst)) {
      state = 0;
      edges++;
    }
  }
  s.edges = edges;
}

static void measureAnalog(int &amin, int &amax, uint32_t &asum) {
  amin = 4095;
  amax = 0;
  asum = 0;
  for (int i = 0; i < ANALOG_SAMPLES; i++) {
    int v = analogRead(PROBE_PIN);
    if (v < amin) amin = v;
    if (v > amax) amax = v;
    asum += (uint32_t)v;
  }
}

static const char *classify(
    uint32_t edges_digital_total,
    uint32_t edges_adc_total,
    float edge_rate_fast_digital,
    float edge_rate_fast_adc,
    int aspan,
    float duty) {
  if (aspan > 1500 && edges_adc_total == 0 && (duty < 2.0f || duty > 98.0f)) return "floating/noisy";
  // Fast digital streams: clocks/data or scanned matrices.
  if (edge_rate_fast_digital > 4000.0f || edge_rate_fast_adc > 4000.0f ||
      edges_digital_total > 300 || edges_adc_total > 300) return "digital-fast";
  // Analog wipers usually show span when moved but limited digital edges.
  if (aspan > 120 && (edges_digital_total + edges_adc_total) < 30) return "analog-like";
  // Slow digital signals such as LED blink / low-rate status lines.
  if (edges_digital_total >= 2 || edges_adc_total >= 2) return "digital-slow";
  return "mostly-static";
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PROBE_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PROBE_PIN, ADC_11db);

  Serial.println();
  Serial.println("=== ESP32 Controller Pin Probe ===");
  Serial.println("Probe pin: GPIO34 via series resistor (1k-10k OK)");
  Serial.println("Output: 2s edges (digital + ADC-threshold) + analog span");

  for (size_t i = 0; i < (sizeof(kControlPwms) / sizeof(kControlPwms[0])); i++) {
    const ControlPwm &cfg = kControlPwms[i];
    bool ok = ledcAttach(cfg.pin, cfg.freq_hz, PWM_RES_BITS);
    if (ok) {
      ledcWrite(cfg.pin, cfg.duty_8bit);
    }
    Serial.printf(
        "CTRL pin=%u pwm=%luHz duty=%u/255 %s\n",
        cfg.pin,
        (unsigned long)cfg.freq_hz,
        (unsigned)cfg.duty_8bit,
        ok ? "ok" : "attach-failed");
  }
}

void loop() {
  static bool init = false;
  static uint32_t report_start_ms = 0;
  static uint32_t edges_total_digital = 0;
  static uint32_t edges_total_adc = 0;
  static uint32_t samples_total = 0;
  static uint32_t highs_total = 0;
  static uint32_t analog_sum_total = 0;
  static uint32_t analog_count_total = 0;
  static int analog_min_total = 4095;
  static int analog_max_total = 0;
  static float fast_edge_rate_peak_digital = 0.0f;
  static float fast_edge_rate_peak_adc = 0.0f;
  static int last_level = 0;

  if (!init) {
    report_start_ms = millis();
    last_level = digitalRead(PROBE_PIN);
    init = true;
  }

  DigitalStats ds;
  measureDigital(ds);
  last_level = ds.last_level;
  edges_total_digital += ds.edges;
  samples_total += ds.samples;
  highs_total += ds.highs;
  float fast_edge_rate_digital = (float)ds.edges * (1000000.0f / (float)FAST_WINDOW_US);
  if (fast_edge_rate_digital > fast_edge_rate_peak_digital) {
    fast_edge_rate_peak_digital = fast_edge_rate_digital;
  }

  AnalogEdgeStats aes;
  measureAnalogEdges(aes);
  edges_total_adc += aes.edges;
  float fast_edge_rate_adc = (float)aes.edges * (1000000.0f / (float)FAST_WINDOW_US);
  if (fast_edge_rate_adc > fast_edge_rate_peak_adc) {
    fast_edge_rate_peak_adc = fast_edge_rate_adc;
  }

  int amin, amax;
  uint32_t asum;
  measureAnalog(amin, amax, asum);
  if (amin < analog_min_total) analog_min_total = amin;
  if (amax > analog_max_total) analog_max_total = amax;
  analog_sum_total += asum;
  analog_count_total += ANALOG_SAMPLES;

  uint32_t now_ms = millis();
  if ((uint32_t)(now_ms - report_start_ms) >= REPORT_WINDOW_MS) {
    int aspan = analog_max_total - analog_min_total;
    int amean = analog_count_total ? (int)(analog_sum_total / analog_count_total) : 0;
    float duty = samples_total ? (100.0f * (float)highs_total / (float)samples_total) : 0.0f;
    const char *kind = classify(
        edges_total_digital,
        edges_total_adc,
        fast_edge_rate_peak_digital,
        fast_edge_rate_peak_adc,
        aspan,
        duty);

    Serial.printf(
        "lvl=%d duty=%5.1f%% edges_d/2s=%4lu edges_a/2s=%4lu fast_d=%8.1f/s fast_a=%8.1f/s adc[min=%4d max=%4d span=%4d mean=%4d] => %s\n",
        last_level,
        duty,
        (unsigned long)edges_total_digital,
        (unsigned long)edges_total_adc,
        fast_edge_rate_peak_digital,
        fast_edge_rate_peak_adc,
        analog_min_total,
        analog_max_total,
        aspan,
        amean,
        kind);

    report_start_ms = now_ms;
    edges_total_digital = 0;
    edges_total_adc = 0;
    samples_total = 0;
    highs_total = 0;
    analog_sum_total = 0;
    analog_count_total = 0;
    analog_min_total = 4095;
    analog_max_total = 0;
    fast_edge_rate_peak_digital = 0.0f;
    fast_edge_rate_peak_adc = 0.0f;
  }
}
