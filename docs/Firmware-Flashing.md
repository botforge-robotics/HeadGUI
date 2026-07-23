# Firmware Flashing

Board: **ESP32 DOIT DevKit V1** (4MB flash, `default.csv` partitions)

Each `.bin` is a **merged** image (bootloader + partition table + app). Flash at address **`0x0`**.

**Preferred:** Espressif Flash Download Tool (GUI)  
**Alternative:** esptool from GitHub (command line)

## Download bins

- **GitHub Releases:** https://github.com/botforge-robotics/HeadGUI/releases  
- **Repo folder (`dev`):** https://github.com/botforge-robotics/HeadGUI/tree/dev/firmware-release  

| File | vs old prototype |
|------|------------------|
| `CanbeeHeadFirmware_2x_merged.bin` | **2×** (~100 kHz) |
| `CanbeeHeadFirmware_3x_merged.bin` | **3×** (~150 kHz, recommended) |
| `CanbeeHeadFirmware_4x_merged.bin` | **4×** (~200 kHz) |

HeadGUI must allow up to **100%** speed for these max rates.

## Before flashing

1. Connect ESP32 USB to PC  
2. If connection fails: hold **BOOT**, tap **RESET**, release **BOOT**  
3. Note the serial port (`COMx` on Windows, `/dev/ttyUSB0` on Linux)  
4. Close HeadGUI / any serial monitor  

## Method 1 (preferred) — Espressif Flash Download Tool

Download: https://www.espressif.com/en/support/download/other-tools  

1. Run Flash Download Tool → **ESP32**  
2. SPIDownload tab → select your `.bin` → address **`0x0`**  
3. SPI MODE **DIO**, FLASH SIZE **4MB**, BAUD **115200**, pick COM port  
4. **START** → wait for FINISH → press **RESET**  

Optional: **ERASE** first, then flash again.

## Method 2 — esptool (CLI)

Repo: https://github.com/espressif/esptool  

```bash
pip install esptool
# or: pip install git+https://github.com/espressif/esptool.git
```

Windows:

```bash
esptool.py --chip esp32 --port COM3 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_3x_merged.bin
```

Linux / macOS:

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 115200 write_flash -z 0x0 CanbeeHeadFirmware_3x_merged.bin
```

Use `_2x_` or `_4x_` filename for those builds. Press **RESET** after flashing.

## Board settings (`platformio.ini`)

| Setting | Value |
|--------|--------|
| Board | `esp32doit-devkit-v1` |
| Flash size | `4MB` |
| Partitions | `default.csv` |
| Baud | `115200` |
| Address | `0x0` |

## Troubleshooting

- Linux permission: add user to `dialout`, or use `sudo` once  
- Port busy: close HeadGUI / serial monitors  
- Connect fail: hold BOOT while starting flash  
- Wrong address: merged bin must use **`0x0`**
