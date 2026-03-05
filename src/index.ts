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
import os from "node:os"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: 'debug' });
const app = express();
const port = 3001;

let qrCodeData: string | null = null;
let connectionStatus: string = 'Inicializando...';
let connectionInfo: any = {};
let logs: string[] = [];

function osLog(){
    try{
        logger.info(`Iniciando Extração de dados da máquina Host`)
        logger.info(`Plataforma que essa aplicação node esta rodando : ${os.platform}`)
        logger.info(`Arquitetura da máquina: ${os.machine}`)
        logger.info(`Prioridade de execução na máquina atual : ${os.setPriority}`)
        logger.info(`Memória liberada no sistema : ${os.freemem}`)
        logger.info(`Interfaces de rede : ${os.networkInterfaces}`)
        logger.info(`Host permite paralelismo? : ${os.availableParallelism() > 0 ? `Capacidade total : ${os.availableParallelism}` : "Não" }`)
        logger.info(`Diretório Raiz : ${os.homedir}`)
    }catch (ex) {
        logger.error(`Ocorreu um erro ao extrair informações do sisteam! ${ex}`)
    }
}

async function networkTestLog(){
    // const testServer = process.env.TEST_SERVER || "localhost:3200"
    logger.info(`== Em produção == testes de rede locais ou servidores apontados!`)
    try{
        // ref : https://dcmwong.medium.com/setting-up-a-tls-server-in-node-js-5652377ac6d3
        // https://nodejs.org/api/tls.html
        // TODO: pegar os endereços pelo browser
        // const tls = await import('node:tls')
        // Testa conexão tls 
        // tls.connect(8000, process.env.URL_TLS_SERVER || ENDERECO_TLS)
        // Testa conexão com porta 3306
        // cosnt resultingQuery = fetch(ENDERECO_BANCO)
        // Testa conexão com porta 443
        // const socket = await openSocket()
        // Testa conexão com porta stmp 25/587/465(SMTPS)/587(STARTTLS)
        // const mailSend = await sender()
        // Testa conexão com porta 20/21/22(SFTP) 
        // const 
        // Testa conexão com porta 80,8080,8000
    
    }catch(ex){
        logger.error(`Ocorreu uma falha ao efetur a comunicação, ou construindo os objetos: ${ex}`)
    }
    
}

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
    osLog()
    networkTestLog()
});
