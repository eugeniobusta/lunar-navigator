# MoonBox firmware

Tabletop model: a WS2812B ring is the skyline around the lander. The web app's MoonBox tab drives it over USB.

## Parts
Arduino Uno or Nano (or any board with USB serial), WS2812B ring (12, 16 or 24 LEDs), 330-470 ohm resistor,
3 jumper wires, optional 1000 uF capacitor.

## Wiring
Ring DIN -> resistor -> pin 6. Ring 5V -> 5V. Ring GND -> GND. Mark LED 0 as north on the model.

## Flash
1. Arduino IDE: install the "Adafruit NeoPixel" library.
2. Open `moonbox.ino`, set `NUM_LEDS` to your ring, upload.
3. On power-up the ring sweeps blue once, then shows LED 0 (north) dim white.

## Test without the app
Serial Monitor at 115200 baud, newline line ending:
- `HELLO` -> `MOONBOX,1`
- `SUN,90,2.5,1` then `EARTH,0,5,1` -> amber LED east, blue LED north.

## Run with the app
Chrome or Edge on a laptop, open the app, MoonBox tab, Connect MoonBox, pick the board's port, Play the window.
If the lit LED moves the wrong way round, set `CLOCKWISE = false`.
