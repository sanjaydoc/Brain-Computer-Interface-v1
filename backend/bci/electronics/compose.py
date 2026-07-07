"""Rule-based circuit composer — the deterministic fallback that runs with no LLM.

It reads keywords from the concept and assembles a sensible components + connections graph
in the SAME schema the LLM emits (id / type / category / name / model / specs / pins / x / y),
so the sanitiser, BOM and schematic builders treat both paths identically. Tuned for BCI
concepts (EEG/electrode/neural → bio-AFE + stimulator) plus common electronics.
"""

from __future__ import annotations

import re

COLS = {"POWER": 50, "ACTUATOR": 280, "MCU": 510, "SENSOR": 740, "MODULE": 970, "DISPLAY": 970}


def _has(text: str, *words: str) -> bool:
    # match at a word start so a keyword is a prefix of a real word (temp→temperature) but
    # not an accidental interior substring (imu must NOT match st-imu-lator).
    return any(re.search(r"\b" + re.escape(w), text) for w in words)


def compose_circuit(concept: str) -> dict:
    t = (concept or "").lower()
    comps: list[dict] = []
    conns: list[dict] = []
    rows: dict[str, int] = {}

    def place(cat: str) -> tuple[int, int]:
        y = 250 if cat == "MCU" else 60 + rows.get(cat, 0) * 150
        rows[cat] = rows.get(cat, 0) + 1
        return COLS.get(cat, 970), y

    def add(cid, ctype, cat, name, model, specs, pins, qty=1) -> str:
        x, y = place(cat)
        comps.append({"id": cid, "type": ctype, "category": cat, "name": name, "model": model,
                      "specs": specs, "quantity": qty, "pins": pins, "x": x, "y": y})
        return cid

    def wire(frm, fpin, to, tpin, typ, label=""):
        conns.append({"from": frm, "fromPin": fpin, "to": to, "toPin": tpin, "type": typ, "label": label})

    def i2c(dev):   # standard 2-wire hookup to the MCU + power
        wire("U1", "SDA", dev, "SDA", "data", "I2C")
        wire("U1", "SCL", dev, "SCL", "data", "I2C")
        wire("PM1", "VOUT", dev, "VCC", "power", "3V3")
        wire("BAT1", "GND", dev, "GND", "power", "GND")

    # --- MCU ---------------------------------------------------------------
    if _has(t, "esp32", "wifi", "wireless", "iot", "ble", "bluetooth"):
        mcu_v = "3V3"
        add("U1", "esp32", "MCU", "Microcontroller", "ESP32-S3", "240MHz Wi-Fi/BLE",
            ["3V3", "GND", "SDA", "SCL", "SPI", "IO"])
    elif _has(t, "stm32"):
        mcu_v = "3V3"
        add("U1", "stm32", "MCU", "Microcontroller", "STM32F411", "100MHz Cortex-M4",
            ["3V3", "GND", "SDA", "SCL", "SPI", "IO"])
    else:
        mcu_v = "5V"
        add("U1", "arduino", "MCU", "Microcontroller", "Arduino Nano", "ATmega328P 5V 16MHz",
            ["5V", "GND", "SDA", "SCL", "D2", "D9"])

    # --- power rail --------------------------------------------------------
    add("BAT1", "battery", "POWER", "Power Supply", "Li-Po 3.7V", "1200mAh + protection", ["V+", "GND"])
    add("PM1", "buck_converter", "POWER", "Regulator", f"{mcu_v} buck", "AP2112 500mA", ["VIN", "VOUT", "GND"])
    wire("BAT1", "V+", "PM1", "VIN", "power", "3.7V")
    wire("PM1", "VOUT", "U1", mcu_v, "power", mcu_v)
    wire("BAT1", "GND", "U1", "GND", "power", "GND")

    has_io = False

    # --- BCI front-end (the on-thesis path) --------------------------------
    if _has(t, "eeg", "ecg", "emg", "brain", "bci", "electrode", "neural", "neuro", "sono", "dust", "cortex"):
        add("AFE1", "sensor", "SENSOR", "Bio-AFE", "ADS1299", "8-ch 24-bit ΔΣ",
            ["IN+", "IN-", "SCLK", "MISO", "DRDY", "VCC", "GND"])
        add("J1", "module", "MODULE", "Electrode array", "8-ch header", "dry/wet electrodes", ["E1", "E8", "REF"])
        add("STIM1", "transistor", "ACTUATOR", "Stimulator", "constant-current", "±5V bipolar", ["CTRL", "OUT+", "OUT-"])
        add("US1", "transistor", "ACTUATOR", "Ultrasound driver", "MOSFET H-bridge", "sonogenetics write", ["CTRL", "XDCR"])
        wire("J1", "E1", "AFE1", "IN+", "data", "electrodes")
        wire("J1", "REF", "AFE1", "IN-", "data", "ref")
        wire("AFE1", "SCLK", "U1", "SPI", "data", "SPI")
        wire("AFE1", "MISO", "U1", "SPI", "data", "SPI")
        wire("AFE1", "DRDY", "U1", "IO", "data", "DRDY")
        wire("U1", "IO", "STIM1", "CTRL", "data", "stim ctrl")
        wire("U1", "IO", "US1", "CTRL", "data", "US ctrl")
        wire("PM1", "VOUT", "AFE1", "VCC", "power", mcu_v)
        wire("BAT1", "GND", "AFE1", "GND", "power", "GND")
        has_io = True

    # --- sensors -----------------------------------------------------------
    if _has(t, "temp", "thermo", "climate"):
        add("T1", "sensor_temp", "SENSOR", "Temperature", "BMP280", "temp/pressure I2C", ["VCC", "GND", "SDA", "SCL"])
        i2c("T1"); has_io = True
    if _has(t, "imu", "motion", "accel", "gyro", "gesture", "orientation"):
        add("IMU1", "sensor_imu", "SENSOR", "IMU", "MPU-6050", "6-axis I2C", ["VCC", "GND", "SDA", "SCL"])
        i2c("IMU1"); has_io = True
    if _has(t, "distance", "ultrasonic", "proximity", "range", "obstacle"):
        add("D1", "sensor_distance", "SENSOR", "Distance", "HC-SR04", "ultrasonic 2-400cm", ["VCC", "GND", "TRIG", "ECHO"])
        wire("U1", "D2", "D1", "TRIG", "data", "TRIG"); wire("D1", "ECHO", "U1", "IO", "data", "ECHO")
        wire("PM1", "VOUT", "D1", "VCC", "power", mcu_v); wire("BAT1", "GND", "D1", "GND", "power", "GND")
        has_io = True

    # --- actuators ---------------------------------------------------------
    if _has(t, "servo"):
        add("SV1", "motor_servo", "ACTUATOR", "Servo", "SG90", "9g PWM servo", ["VCC", "GND", "SIG"])
        wire("U1", "D9", "SV1", "SIG", "data", "PWM"); wire("BAT1", "V+", "SV1", "VCC", "power", "5V")
        wire("BAT1", "GND", "SV1", "GND", "power", "GND"); has_io = True
    if _has(t, "motor", "wheel", "drive", "pump", "fan"):
        add("DRV1", "module", "MODULE", "Motor driver", "L298N", "dual H-bridge", ["IN1", "IN2", "OUT1", "OUT2", "VCC"])
        add("M1", "motor_dc", "ACTUATOR", "DC Motor", "N20 gearmotor", "6V", ["+", "-"])
        wire("U1", "D2", "DRV1", "IN1", "data", "PWM"); wire("U1", "D9", "DRV1", "IN2", "data", "DIR")
        wire("DRV1", "OUT1", "M1", "+", "power", ""); wire("DRV1", "OUT2", "M1", "-", "power", "")
        wire("BAT1", "V+", "DRV1", "VCC", "power", "3.7V"); has_io = True
    if _has(t, "oled", "display", "screen", "lcd"):
        add("OL1", "oled", "DISPLAY", "Display", "SSD1306 OLED", "128x64 I2C", ["VCC", "GND", "SDA", "SCL"])
        i2c("OL1"); has_io = True

    # --- default indicator so every circuit has an output ------------------
    if not has_io or _has(t, "led", "light", "blink", "indicator"):
        add("R1", "resistor", "MODULE", "Current-limit resistor", "220Ω 1/4W", "220 ohm", ["1", "2"])
        add("LED1", "led", "DISPLAY", "LED", "Red 5mm", "2V 20mA", ["A", "K"])
        wire("U1", "D9", "R1", "1", "data", ""); wire("R1", "2", "LED1", "A", "data", "")
        wire("LED1", "K", "U1", "GND", "power", "GND")

    title = (concept or "").strip()[:80] or "Custom circuit"
    return {"title": title, "description": (concept or "").strip(), "components": comps, "connections": conns}
