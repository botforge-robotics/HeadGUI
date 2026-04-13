# HeadGUI Remote Wi-Fi Setup Guide

This guide explains how to:

1. Pull the latest code
2. Start the serial WebSocket bridge on the robot host machine
3. Open the GUI from a remote PC over Wi-Fi and connect wirelessly

---

## 1) Pull latest code

On the machine where this repo exists:

```bash
cd /path/to/HeadGUI
git pull
npm install
```

Use `npm install` after pulling so any new dependencies are installed.

---

## 2) Start the serial WS bridge (on robot host machine)

Run this on the machine physically connected to the robot via USB serial (for example Raspberry Pi).

### Option A: auto-detect CP210x USB serial

```bash
cd /path/to/HeadGUI
npm run bridge -- --auto --listen 8765 --host 0.0.0.0
```

### Option B: set serial device path manually

```bash
cd /path/to/HeadGUI
npm run bridge -- --serial /dev/ttyUSB0 --listen 8765 --host 0.0.0.0
```

Optional token protection:

```bash
npm run bridge -- --auto --listen 8765 --host 0.0.0.0 --token mysecret
```

If using Linux firewall, allow inbound TCP `8765` on the host machine.

---

## 3) Choose how to run the GUI

You have two valid options.

### Option A: Run GUI on one host, open from remote browser

On the GUI host machine (same repo):

```bash
cd /path/to/HeadGUI
npm run dev:remote
```

This binds Vite to all interfaces so other devices in the same Wi-Fi network can open:

```text
http://<GUI_HOST_IP>:5173
```

Example:

```text
http://192.168.1.100:5173
```

---

### Option B: Clone and run GUI locally on remote desktop

On the remote desktop machine:

```bash
git clone https://github.com/botforge-robotics/HeadGUI.git
cd HeadGUI
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

This keeps the GUI local to the remote desktop, while robot communication still goes through the bridge host over Wi-Fi.

---

## 4) Connect GUI to bridge over Wi-Fi

In the GUI (whether Option A or Option B):

1. Open **Connection Settings**
2. Select **Wireless**
3. Enter:
   - **Bridge Host**: IP of the machine running `serial-ws-bridge`
   - **Port**: `8765` (or your custom bridge listen port)
   - **Token**: only if bridge was started with `--token`
4. Click **Connect wireless**

When connected, status changes to **Online**.

---

## 5) Quick network checklist

- Bridge host and GUI machine are on the same LAN/Wi-Fi
- Bridge host serial cable is connected and port is available
- `serial-ws-bridge` is running and listening on `0.0.0.0:8765`
- Firewalls allow TCP `8765` (bridge), plus TCP `5173` if using Option A
- Use plain `ws://` and `http://` on local LAN (current setup)

---
