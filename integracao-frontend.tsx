// 🔌 Integração SSE no Frontend React
// Adicionar ao App.tsx do Vendfy CRM

import { useEffect, useState, useRef } from 'react';

// ============================================
// HOOK PERSONALIZADO - useSSEMessages
// ============================================
function useSSEMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    console.log('[SSE] Conectando para chat:', chatId);
    
    // Criar conexão SSE
    const eventSource = new EventSource(
      `https://TUA_URL_SSE/events/${chatId}`
    );
    eventSourceRef.current = eventSource;

    // Quando conectar
    eventSource.onopen = () => {
      console.log('[SSE] ✅ Conectado');
      setIsConnected(true);
    };

    // Receber mensagens
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE] 📨 Dados recebidos:', data);

        if (data.type === 'initial_messages') {
          // Primeira carga - substituir tudo
          console.log('[SSE] 📥 Mensagens iniciais:', data.messages.length);
          setMessages(data.messages);
        } 
        else if (data.type === 'new_messages') {
          // Novas mensagens - adicionar ao fim
          console.log('[SSE] ✨ Novas mensagens:', data.messages.length);
          setMessages(prev => {
            // Evitar duplicatas
            const existing = new Set(prev.map(m => m.id));
            const newOnes = data.messages.filter((m: Message) => !existing.has(m.id));
            return [...prev, ...newOnes];
          });
        }
      } catch (error) {
        console.error('[SSE] ❌ Erro ao processar:', error);
      }
    };

    // Erro ou desconexão
    eventSource.onerror = (error) => {
      console.error('[SSE] ❌ Erro:', error);
      setIsConnected(false);
      
      // EventSource reconecta automaticamente
      // Mas podemos forçar se necessário:
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('[SSE] 🔄 Reconectando...');
        }
      }, 3000);
    };

    // Cleanup ao desmontar ou trocar chat
    return () => {
      console.log('[SSE] 🔌 Desconectando de:', chatId);
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [chatId]);

  return { messages, isConnected };
}

// ============================================
// EXEMPLO DE USO NO APP.TSX
// ============================================

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Usar SSE para mensagens em tempo real
  const { messages: sseMessages, isConnected } = useSSEMessages(selectedId);

  // Atualizar conversa selecionada com mensagens do SSE
  useEffect(() => {
    if (!selectedId || sseMessages.length === 0) return;

    setConversations(prev => prev.map(conv => {
      if (conv.id === selectedId) {
        return {
          ...conv,
          mensagens: sseMessages
        };
      }
      return conv;
    }));
  }, [selectedId, sseMessages]);

  // Indicador visual de conexão
  const ConnectionIndicator = () => (
    <div className="fixed top-4 right-4 flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
      }`} />
      <span className="text-xs text-gray-400">
        {isConnected ? 'Tempo Real' : 'Desconectado'}
      </span>
    </div>
  );

  return (
    <div>
      <ConnectionIndicator />
      
      {/* Resto do app */}
      <ChatWindow 
        selectedConversation={selectedConversation}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

// ============================================
// ALTERNATIVA: INTEGRAÇÃO DIRETA (sem hook)
// ============================================

function AppAlternativo() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!selectedId) return;

    const eventSource = new EventSource(
      `https://vendfy-sse.vendfy.online/events/${selectedId}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      setConversations(prev => prev.map(conv => {
        if (conv.id === selectedId) {
          if (data.type === 'initial_messages') {
            return { ...conv, mensagens: data.messages };
          } else if (data.type === 'new_messages') {
            return { 
              ...conv, 
              mensagens: [...conv.mensagens, ...data.messages] 
            };
          }
        }
        return conv;
      }));
    };

    return () => eventSource.close();
  }, [selectedId]);

  // Resto do código...
}

// ============================================
// FALLBACK: Se SSE não funcionar, usar Polling
// ============================================

function usePollingFallback(chatId: string | null, enabled: boolean) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!chatId || !enabled) return;

    const fetchMessages = async () => {
      try {
        const response = await fetch(
          `https://TUA_URL_SSE/api/messages/${chatId}`
        );
        const data = await response.json();
        setMessages(data.messages);
      } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // 5s

    return () => clearInterval(interval);
  }, [chatId, enabled]);

  return messages;
}

// ============================================
// EXPORTAR
// ============================================

export { useSSEMessages, usePollingFallback };
