const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let port = null;
let parser = null;

// USB filter: only show CH340 (WCH) and CP210x (Silicon Labs) - common on ESP32 boards
const ESP32_USB_VENDORS = {
    '1a86': true,   // CH340/CH341 (WCH)
    '10c4': true,   // CP210x (Silicon Labs)
};
function isEsp32UsbPort(p) {
    const vid = (p.vendorId || '').toLowerCase().replace(/^0x/, '');
    const man = (p.manufacturer || '').toLowerCase();
    if (vid && ESP32_USB_VENDORS[vid]) return true;
    if (man.includes('ch340') || man.includes('ch341') || man.includes('wch')) return true;
    if (man.includes('silicon') || man.includes('cp210')) return true;
    return false;
}

function setupSerialHandlers(ipcMain) {
    // List available serial ports (ESP32-style USB only: CH340, CP210x); handles no ports and errors
    ipcMain.handle('serial:list', async () => {
        try {
            const ports = await SerialPort.list();
            const list = (ports || [])
                .filter(isEsp32UsbPort)
                .map(p => ({
                    path: p.path,
                    manufacturer: p.manufacturer,
                    serialNumber: p.serialNumber,
                    productId: p.productId,
                    vendorId: p.vendorId,
                }));
            return { ports: list };
        } catch (error) {
            const msg = error && (error.message || String(error));
            console.error('Failed to list serial ports:', error);
            return { ports: [], error: msg };
        }
    });

    // Connect to a serial port
    ipcMain.handle('serial:connect', async (event, portPath) => {
        try {
            if (port && port.isOpen) {
                await port.close();
            }

            // dtr: false, rts: false - avoid DTR/RTS toggle on close which can halt ESP32
            // (closing port without asserting these reduces risk of board reset/hang)
            port = new SerialPort({
                path: portPath,
                baudRate: 115200,
                autoOpen: false,
                dtr: false,
                rts: false,
            });

            parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

            return new Promise((resolve, reject) => {
                port.open((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    event.sender.send('serial:status', { connected: true, port: portPath });

                    // Ignore ESP32 boot log for a short period after connect (ESP may reset and dump boot)
                    const BOOT_DRAIN_MS = 2000;
                    let forwardData = false;
                    const bootTimer = setTimeout(() => { forwardData = true; }, BOOT_DRAIN_MS);

                    parser.on('data', (data) => {
                        if (forwardData) event.sender.send('serial:data', data.trim());
                    });

                    port.on('close', () => {
                        clearTimeout(bootTimer);
                        event.sender.send('serial:status', { connected: false });
                    });

                    port.on('error', (err) => {
                        clearTimeout(bootTimer);
                        console.error('Serial error:', err);
                        event.sender.send('serial:status', { connected: false, error: err.message });
                    });

                    resolve({ success: true, port: portPath });
                });
            });
        } catch (error) {
            console.error('Failed to connect:', error);
            return { success: false, error: error.message };
        }
    });

    // Disconnect from serial port
    ipcMain.handle('serial:disconnect', async () => {
        if (port && port.isOpen) {
            await port.close();
            port = null;
            parser = null;
            return { success: true };
        }
        return { success: false, error: 'No port opened' };
    });

    // Send data to serial port
    ipcMain.handle('serial:send', async (event, data) => {
        if (port && port.isOpen) {
            return new Promise((resolve, reject) => {
                port.write(data + '\n', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ success: true });
                    }
                });
            });
        }
        return { success: false, error: 'Port not open' };
    });
}

module.exports = { setupSerialHandlers };
