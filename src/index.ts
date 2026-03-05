import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    ConnectionState,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: 'debug' });
const app = express();
const port = 3001;

let qrCodeData: string | null = null;
let connectionStatus: string = 'Initializing...';
let connectionInfo: any = {};
let logs: string[] = [];

function addLog(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    logs.push(logEntry);
    if (logs.length > 50) logs.shift();
    logger.info(message);
}

async function connectToWhatsApp() {
    addLog('Starting Baileys connection...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version: version,
        auth: state,
        printQRInTerminal: true,
        logger: logger
    });

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection) {
            addLog(`Connection update: ${connection}`);
        }

        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr);
            connectionStatus = 'QR Code generated, please scan.';
            addLog('New QR Code generated');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const reason = Object.entries(DisconnectReason).find(([_, v]) => v === statusCode)?.[0] || 'Unknown reason';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            connectionStatus = `Closed: ${reason} (${statusCode}). Reconnecting: ${shouldReconnect}`;
            addLog(`Connection closed. Reason: ${reason} (${statusCode}). Error: ${lastDisconnect?.error?.message}. Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                addLog('Attempting to reconnect in 3 seconds...');
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            connectionStatus = 'Connected successfully!';
            qrCodeData = null;
            addLog('WhatsApp connection opened successfully!');
        }

        connectionInfo = { ...connectionInfo, ...update };
    });

    sock.ev.on('creds.update', () => {
        addLog('Credentials updated and saved.');
        saveCreds();
    });
}

// Routes
app.use(express.static(path.join(__dirname, '../public')));

app.get('/status', (_req, res) => {
    res.json({
        status: connectionStatus,
        qrCode: qrCodeData,
        info: connectionInfo,
        logs: logs
    });
});

app.listen(port, () => {
    addLog(`Server running at http://localhost:${port}`);
    connectToWhatsApp();
});
