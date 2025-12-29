const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3002;

// PostgreSQL connection (mesma DB do n8n)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Cache de última verificação (evita queries desnecessárias)
let lastCheckCache = new Map(); // chatId -> lastTimestamp

// Clientes SSE conectados
let sseClients = [];

console.log('🚀 Vendfy SSE Server');
console.log('📡 Conectando ao PostgreSQL do n8n...');

// ============================================
// SSE ENDPOINT - Frontend conecta aqui
// ============================================
app.get('/events/:chatId', (req, res) => {
  const { chatId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  console.log(`✅ [SSE] Cliente conectado para chat: ${chatId}`);
  
  const client = { res, chatId, lastSent: Date.now() };
  sseClients.push(client);
  
  // Heartbeat a cada 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeat);
    }
  }, 30000);
  
  // Enviar mensagens existentes imediatamente
  sendExistingMessages(client);
  
  // Cleanup ao desconectar
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c !== client);
    console.log(`❌ [SSE] Cliente desconectado: ${chatId}. Total: ${sseClients.length}`);
  });
});

// ============================================
// API REST - Buscar mensagens manualmente
// ============================================
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  
  try {
    const result = await pool.query(
      `SELECT * FROM n8n_fila_mensagens 
       WHERE telefone = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [chatId, limit]
    );
    
    const messages = result.rows.reverse().map(formatMessage);
    res.json({ messages });
  } catch (error) {
    console.error('❌ [API] Erro ao buscar mensagens:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POLLING INTELIGENTE DO POSTGRESQL
// ============================================
async function pollNewMessages() {
  if (sseClients.length === 0) {
    // Nenhum cliente conectado, skip
    return;
  }
  
  try {
    // Buscar chats únicos dos clientes conectados
    const chatIds = [...new Set(sseClients.map(c => c.chatId))];
    
    // Query otimizada: apenas chats ativos
    const result = await pool.query(
      `SELECT * FROM n8n_fila_mensagens 
       WHERE telefone = ANY($1) 
       ORDER BY timestamp DESC`,
      [chatIds]
    );
    
    if (result.rows.length === 0) return;
    
    // Agrupar mensagens por chat
    const messagesByChat = {};
    result.rows.forEach(row => {
      if (!messagesByChat[row.telefone]) {
        messagesByChat[row.telefone] = [];
      }
      messagesByChat[row.telefone].push(row);
    });
    
    // Enviar para cada cliente
    sseClients.forEach(client => {
      const messages = messagesByChat[client.chatId] || [];
      
      if (messages.length > 0) {
        const lastTimestamp = lastCheckCache.get(client.chatId);
        
        // Filtrar apenas mensagens novas
        const newMessages = messages.filter(msg => {
          const msgTime = new Date(msg.timestamp).getTime();
          return !lastTimestamp || msgTime > lastTimestamp;
        });
        
        if (newMessages.length > 0) {
          const formatted = newMessages.map(formatMessage);
          const data = JSON.stringify({
            type: 'new_messages',
            messages: formatted
          });
          
          try {
            client.res.write(`data: ${data}\n\n`);
            console.log(`📨 [SSE] ${newMessages.length} mensagens enviadas para ${client.chatId}`);
            
            // Atualizar cache
            const latestTimestamp = Math.max(...newMessages.map(m => new Date(m.timestamp).getTime()));
            lastCheckCache.set(client.chatId, latestTimestamp);
          } catch (err) {
            console.error('❌ [SSE] Erro ao enviar para cliente:', err.message);
          }
        }
      }
    });
    
  } catch (error) {
    console.error('❌ [POLL] Erro ao buscar mensagens:', error.message);
  }
}

// ============================================
// ENVIAR MENSAGENS EXISTENTES (primeira conexão)
// ============================================
async function sendExistingMessages(client) {
  try {
    const result = await pool.query(
      `SELECT * FROM n8n_fila_mensagens 
       WHERE telefone = $1 
       ORDER BY timestamp DESC 
       LIMIT 50`,
      [client.chatId]
    );
    
    if (result.rows.length > 0) {
      const formatted = result.rows.reverse().map(formatMessage);
      const data = JSON.stringify({
        type: 'initial_messages',
        messages: formatted
      });
      
      client.res.write(`data: ${data}\n\n`);
      console.log(`📬 [SSE] ${result.rows.length} mensagens iniciais enviadas para ${client.chatId}`);
      
      // Atualizar cache
      const latestTimestamp = Math.max(...result.rows.map(m => new Date(m.timestamp).getTime()));
      lastCheckCache.set(client.chatId, latestTimestamp);
    }
  } catch (error) {
    console.error('❌ [SSE] Erro ao enviar mensagens iniciais:', error);
  }
}

// ============================================
// FORMATAR MENSAGEM PARA O FRONTEND
// ============================================
function formatMessage(row) {
  // Adaptar formato do n8n para o frontend React
  return {
    id: row.id_mensagem || row.id || String(row.timestamp),
    texto: row.mensagem || row.text || '',
    tipo: row.from_me === true ? 'enviada' : 'recebida',
    timestamp: formatTime(row.timestamp),
    status: row.from_me === true ? 'entregue' : 'lida',
    mediaType: row.media_type || 'text',
    mediaUrl: row.media_url || null
  };
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clients: sseClients.length,
    activeChats: [...new Set(sseClients.map(c => c.chatId))].length,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// TESTAR CONEXÃO DB
// ============================================
async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ [DB] Conexão PostgreSQL OK');
    
    // Verificar se tabela existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'n8n_fila_mensagens'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ [DB] Tabela "n8n_fila_mensagens" encontrada');
      
      // Contar mensagens
      const count = await pool.query('SELECT COUNT(*) FROM n8n_fila_mensagens');
      console.log(`📊 [DB] ${count.rows[0].count} mensagens na fila`);
    } else {
      console.warn('⚠️  [DB] Tabela "n8n_fila_mensagens" não encontrada!');
      console.warn('⚠️  [DB] Cria a tabela no n8n primeiro!');
    }
  } catch (error) {
    console.error('❌ [DB] Erro ao conectar:', error.message);
    process.exit(1);
  }
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Vendfy SSE Server INICIADO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🔗 SSE endpoint: /events/:chatId`);
  console.log(`📊 API endpoint: /api/messages/:chatId`);
  console.log(`💚 Health check: /health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  await testDatabaseConnection();
  
  // Iniciar polling (a cada 2 segundos)
  setInterval(pollNewMessages, 2000);
  console.log('✅ Polling iniciado (2s interval)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Servidor pronto! Aguardando conexões...');
});
