// MoonBox: a ring of WS2812B LEDs is the horizon around the lander. The web app sends where the Sun and
// Earth are; the ring lights them. Protocol (docs/INTERFACES.md section 7), 115200 baud, one line each:
//   SUN,<az_deg>,<el_deg>,<frac 0..1>
//   EARTH,<az_deg>,<el_deg>,<vis 0|1>
//   HELLO            -> replies "MOONBOX,1"
//
// Wiring: ring DIN -> pin 6 through a 330-470 ohm resistor; ring 5V and GND -> Arduino 5V and GND.
// Optional: 1000 uF capacitor across the ring's 5V and GND. Keep brightness low on USB power.
// Library: Adafruit NeoPixel (Arduino IDE: Tools > Manage Libraries > "Adafruit NeoPixel").
// LED 0 must point north (towards the "N" mark on the model). Set NUM_LEDS to your ring (12, 16, 24).

#include <Adafruit_NeoPixel.h>

const uint8_t PIN = 6;
const uint8_t NUM_LEDS = 24;
const uint8_t MAX_BRIGHT = 80;      // 0..255; ~80 keeps a 24-LED ring within USB current
const bool CLOCKWISE = true;        // flip if the lit LED moves the wrong way round the ring

Adafruit_NeoPixel ring(NUM_LEDS, PIN, NEO_GRB + NEO_KHZ800);

float sunAz = 0, sunFrac = 0, earthAz = 0;
bool earthVis = false;
char line[48];
uint8_t len = 0;

uint8_t ledFor(float az) {
  float a = fmod(fmod(az, 360.0) + 360.0, 360.0);
  uint8_t i = (uint8_t)((a / 360.0) * NUM_LEDS + 0.5) % NUM_LEDS;
  return CLOCKWISE ? i : (NUM_LEDS - i) % NUM_LEDS;
}

void draw() {
  ring.clear();
  if (earthVis) ring.setPixelColor(ledFor(earthAz), ring.Color(20, 90, 200));
  if (sunFrac > 0.01) {
    uint8_t b = (uint8_t)(MAX_BRIGHT * sunFrac);
    // Amber; drawn last so the Sun wins when both share an LED.
    ring.setPixelColor(ledFor(sunAz), ring.Color(b * 3, b * 2, 0));
  }
  ring.show();
}

void handle(char *s) {
  if (strcmp(s, "HELLO") == 0) { Serial.println("MOONBOX,1"); return; }
  char *kind = strtok(s, ",");
  char *az = strtok(NULL, ",");
  char *el = strtok(NULL, ",");
  char *v = strtok(NULL, ",");
  if (!kind || !az || !el || !v) return;
  if (strcmp(kind, "SUN") == 0) { sunAz = atof(az); sunFrac = constrain(atof(v), 0, 1); }
  else if (strcmp(kind, "EARTH") == 0) { earthAz = atof(az); earthVis = atoi(v) == 1; draw(); }
}

void setup() {
  Serial.begin(115200);
  ring.begin();
  ring.setBrightness(255);
  // Start-up sweep so you can see the ring works and where LED 0 (north) is.
  for (uint8_t i = 0; i < NUM_LEDS; i++) {
    ring.clear(); ring.setPixelColor(i, ring.Color(0, 0, 40)); ring.show(); delay(25);
  }
  ring.clear(); ring.setPixelColor(0, ring.Color(40, 40, 40)); ring.show();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (len) { line[len] = 0; handle(line); len = 0; }
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
    }
  }
}
