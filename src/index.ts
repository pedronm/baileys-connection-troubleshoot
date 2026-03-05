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
let connectionStatus: string = 'Inicializando...';
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
    addLog('Iniciando conexão Baileys...');
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
            addLog(`Atualização de conexão: ${connection}`);
        }

        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr);
            connectionStatus = 'QR Code gerado, por favor escaneie.';
            addLog('Novo QR Code gerado');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const reason = Object.entries(DisconnectReason).find(([_, v]) => v === statusCode)?.[0] || 'Razão desconhecida';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            connectionStatus = `Fechado: ${reason} (${statusCode}). Reconectando: ${shouldReconnect ? 'Sim' : 'Não'}`;
            addLog(`Conexão fechada. Razão: ${reason} (${statusCode}). Erro: ${lastDisconnect?.error?.message}. Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                addLog('Tentando reconectar em 3 segundos...');
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            connectionStatus = 'Conectado com sucesso!';
            qrCodeData = null;
            addLog('Conexão com WhatsApp aberta com sucesso!');
        }

        connectionInfo = { ...connectionInfo, ...update };
    });

    sock.ev.on('creds.update', () => {
        addLog('Credenciais atualizadas e salvas.');
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
    addLog(`Servidor rodando em http://localhost:${port}`);
    connectToWhatsApp();
});
