# Firmware release bins (HeadGUI)

Merged ESP32 flash images for Canbee Head (bootloader + partitions + app).  
Flash address: **`0x0`**. Board: **ESP32 DOIT DevKit V1**, 4MB, `default.csv`.

| File | Speed vs old prototype |
|------|-------------------------|
| `CanbeeHeadFirmware_2x_merged.bin` | **2×** (~100 kHz max) |
| `CanbeeHeadFirmware_3x_merged.bin` | **3×** (~150 kHz max) |
| `CanbeeHeadFirmware_4x_merged.bin` | **4×** (~200 kHz max) |

## Where to get them

- **This folder** on the `dev` branch  
- **GitHub Releases:** https://github.com/botforge-robotics/HeadGUI/releases  

## How to flash

Full guide (preferred GUI tool + esptool CLI):  
**Wiki:** https://github.com/botforge-robotics/HeadGUI/wiki/Firmware-Flashing  

Also see `FLASH_README.md` in this folder.
