"""Circuit-generation prompt — ported verbatim (behaviour-for-behaviour) from
inventor-studio-v3 ``routes/electronics.js`` ``buildCircuitPrompt``.

It asks the LLM for BOTH components AND connections (the wiring), with strict id rules,
a fixed column layout and a worked example, so the model emits real wires — not just a
parts list. The output is a single JSON object matching the schema the sanitizer expects.
"""

from __future__ import annotations

ALLOWED_TYPES = (
    "mcu, arduino, esp32, esp8266, stm32, sensor, sensor_imu, sensor_temp, "
    "sensor_distance, motor_dc, motor_servo, motor_stepper, esc, battery, "
    "buck_converter, regulator, relay, bluetooth, wifi, lora, gps, display, oled, "
    "lcd, resistor, capacitor, led, diode, transistor, buzzer, switch, camera, module"
)
ALLOWED_CATEGORIES = "MCU, SENSOR, ACTUATOR, POWER, MODULE, DISPLAY"


def build_circuit_prompt(concept: str) -> str:
    return f"""You are an expert electronics engineer. Design a complete, accurate wiring diagram for: "{concept}"

CRITICAL RULES — follow exactly or the diagram will be broken:
1. Every "id" in components must be a SHORT alphanumeric string like "FC1", "ESC1", "BAT1", "M1", "M2"
2. Every connection "from" and "to" must EXACTLY match an "id" in the components list — no typos, no missing IDs
3. Positions: x between 50-1100, y between 50-700. Cards are 190px wide and 200px tall. Minimum 220px gap between card x-positions in same row to avoid overlap
4. Every major component must have at least one connection
5. Output ONLY raw JSON — no markdown fences, no explanation, nothing else

Layout columns (use these x values):
- POWER column:    x=50
- ACTUATOR column: x=280   (space items 220px apart vertically)
- MCU column:      x=510, y=250
- SENSOR column:   x=740
- MODULE column:   x=970

Allowed "type" values: {ALLOWED_TYPES}

Allowed "category" values: {ALLOWED_CATEGORIES}

Connection "type": "power" (for VCC/GND/voltage rails) or "data" (for signals/I2C/SPI/PWM/UART)

EXAMPLE of correct output for "Arduino LED blinker":
{{"title":"Arduino LED Blinker","description":"Arduino Nano blinks an LED via current-limiting resistor","components":[{{"id":"U1","type":"arduino","category":"MCU","name":"Microcontroller","model":"Arduino Nano","specs":"ATmega328P 5V 16MHz","quantity":1,"pins":["5V","GND","D13"],"x":510,"y":250}},{{"id":"R1","type":"resistor","category":"MODULE","name":"Current Limit Resistor","model":"220Ω 1/4W","specs":"220 ohm","quantity":1,"pins":["1","2"],"x":740,"y":250}},{{"id":"LED1","type":"led","category":"DISPLAY","name":"LED","model":"Red 5mm LED","specs":"2V 20mA","quantity":1,"pins":["A","K"],"x":970,"y":250}},{{"id":"BAT1","type":"battery","category":"POWER","name":"Power Supply","model":"USB 5V","specs":"5V via USB","quantity":1,"pins":["5V","GND"],"x":50,"y":250}}],"connections":[{{"from":"BAT1","fromPin":"5V","to":"U1","toPin":"5V","type":"power","label":"5V"}},{{"from":"BAT1","fromPin":"GND","to":"U1","toPin":"GND","type":"power","label":"GND"}},{{"from":"U1","fromPin":"D13","to":"R1","toPin":"1","type":"data","label":"PWM"}},{{"from":"R1","fromPin":"2","to":"LED1","toPin":"A","type":"data","label":""}},{{"from":"LED1","fromPin":"K","to":"U1","toPin":"GND","type":"power","label":"GND"}}]}}

Now design the full circuit for: "{concept}"
Include all necessary components (power supply, decoupling caps, pull-up resistors where needed).
Use realistic specific models (e.g. "Betaflight F4", "30A ESC", "2306 2400KV").
Output ONLY the JSON object:"""
