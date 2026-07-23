# Firmware release bins (HeadGUI)

Merged ESP32 flash images for Canbee Head (bootloader + partition table + app).  
Flash address: **`0x0`**. Board: **ESP32 DOIT DevKit V1**, 4MB, `default.csv`.

| File | Speed vs old prototype |
|------|-------------------------|
| `CanbeeHeadFirmware_2x_merged.bin` | **2×** (~100 kHz max) |
| `CanbeeHeadFirmware_3x_merged.bin` | **3×** (~150 kHz max) |
| `CanbeeHeadFirmware_4x_merged.bin` | **4×** (~200 kHz max) |

## Where to get them

- **GitHub Releases (bins only):** https://github.com/botforge-robotics/HeadGUI/releases  
- **This folder** on the `dev` branch  

On the Releases page, download only the `.bin` files. GitHub always shows auto-generated “Source code” zip/tar — you do **not** need those for flashing.

## How to flash

See **`FLASH_README.md`** in this folder (Espressif Flash Download Tool preferred, then esptool CLI).
