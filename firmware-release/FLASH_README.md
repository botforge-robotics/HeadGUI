# Canbee Head Firmware — Flash Guide

Board: **ESP32 DOIT DevKit V1** (4MB flash, `default.csv` partitions)

Each `.bin` is a **merged** image (bootloader + partition table + app). Flash it at address **`0x0`**.

**Preferred:** Espressif Flash Download Tool (GUI)  
**Alternative:** esptool from GitHub (command line)

Download bins from:
- Repo folder: [`firmware-release/`](https://github.com/botforge-robotics/HeadGUI/tree/dev/firmware-release)
- GitHub Releases: https://github.com/botforge-robotics/HeadGUI/releases
- Wiki (this guide): https://github.com/botforge-robotics/HeadGUI/wiki/Firmware-Flashing

---

## Which bin to use?

| File | Scale | Max at GUI `SPEED 100` | vs old prototype |
|------|-------|------------------------|------------------|
| `CanbeeHeadFirmware_2x_merged.bin` | 0.5 | ~100 kHz | **2×** |
| `CanbeeHeadFirmware_3x_merged.bin` | 0.75 | ~150 kHz | **3×** (recommended default) |
| `CanbeeHeadFirmware_4x_merged.bin` | 1.0 | ~200 kHz | **4×** |

Old prototype max ≈ 50 kHz (GUI capped at 50% with firmware scale 0.5).  
HeadGUI must allow up to **100%** speed for these max rates.

Pick one file, then use Method 1 or 2 below (same steps for all three).

---

## Before flashing (both methods)

1. Connect ESP32 USB to PC  
2. If connection fails: hold **BOOT**, tap **RESET**, release **BOOT**  
3. Note the serial port:
   - Windows: `COM3` (Device Manager → Ports)
   - Linux: `/dev/ttyUSB0` or `/dev/ttyACM0`
4. Close HeadGUI / any serial monitor so the port is free  

---

## Method 1 (preferred) — Espressif Flash Download Tool (GUI)

Official download:  
https://www.espressif.com/en/support/download/other-tools  

Look for **Flash Download Tools** (Windows).

### Steps

1. Unzip and run the Flash Download Tool  
2. Select **Chip Type: ESP32** → **OK**  
3. Open the **SPIDownload** tab  
4. Enable one row and set:
   - **File:** browse to your chosen bin (`…_2x_…` / `…_3x_…` / `…_4x_…`)
   - **Address:** `0x0` (or `0`)
5. Set:
   - **SPI SPEED:** 40MHz (or default)
   - **SPI MODE:** DIO
   - **FLASH SIZE:** 4MB (32Mbit)
   - **COM:** your COM port (e.g. COM3)
   - **BAUD:** `115200`
6. Click **START**  
7. Wait until it shows **FINISH** / success  
8. Press **RESET** on the board (or unplug/replug USB)

### Optional clean flash

In the same tool, use **ERASE** first, then flash again with the settings above.

---

## Method 2 — esptool (GitHub / command line)

Official repo: https://github.com/espressif/esptool  

### Install

```bash
pip install esptool
```

Or from git:

```bash
pip install git+https://github.com/espressif/esptool.git
```

Check:

```bash
esptool.py version
```

### Flash (example: 3×)

**Windows:**

```bash
esptool.py --chip esp32 --port COM3 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_3x_merged.bin
```

**Linux / macOS:**

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_3x_merged.bin
```

For 2× or 4×, only change the filename:

```bash
esptool.py --chip esp32 --port COM3 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_2x_merged.bin
esptool.py --chip esp32 --port COM3 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_4x_merged.bin
```

After success, press **RESET**.

### Optional: erase first

```bash
esptool.py --chip esp32 --port COM3 erase_flash
```

Then run `write_flash` again.

---

## Board / flash settings (from firmware `platformio.ini`)

| Setting | Value |
|--------|--------|
| Board | `esp32doit-devkit-v1` |
| Flash size | `4MB` |
| Partitions | `default.csv` |
| Upload baud | `115200` |
| Chip | ESP32 |
| Merged bin address | `0x0` |

---

## Troubleshooting

- **Permission denied (Linux):** `sudo usermod -aG dialout $USER` then log out/in, or use `sudo` once.
- **Port busy:** Close HeadGUI / serial monitors, then flash again.
- **Failed to connect:** Hold BOOT while starting flash / clicking START.
- **Wrong address:** Merged bin must be flashed at **`0x0`**, not `0x10000`.
