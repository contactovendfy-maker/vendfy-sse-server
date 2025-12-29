# ⚡ GUIA RÁPIDO - SSE Server em 15 Minutos

## ✅ CHECKLIST PRÉ-DEPLOY

- [ ] n8n rodando em `n8n.vendfy.online`
- [ ] PostgreSQL do n8n funcionando
- [ ] Tabela `n8n_fila_mensagens` existe
- [ ] Conta GitHub criada
- [ ] Acesso ao Coolify

---

## 🎯 PASSO 1: DATABASE_URL (3 min)

### 1.1 Encontrar PostgreSQL do n8n

1. Abre **Coolify**
2. Vai para o projeto onde **n8n** está
3. Procura resource tipo **"PostgreSQL"** ou **"Database"**
4. Pode ter nome como:
   - `n8n-db`
   - `postgres-n8n`
   - `secretaria-db`

### 1.2 Copiar URL

1. Clica na database
2. Procura por **"Internal Database URL"** ou **"Connection String"**
3. Exemplo:
   ```
   postgresql://n8n:senha@postgres-abc:5432/n8n
   ```
4. **COPIA e GUARDA** num bloco de notas!

---

## 📦 PASSO 2: GitHub (2 min)

### 2.1 Criar Repositório

1. https://github.com/new
2. Nome: `vendfy-sse-server`
3. Público
4. ❌ Sem README
5. **Create**

### 2.2 Upload Código

Terminal (Git Bash):

```bash
cd vendfy-sse-server
git init
git add .
git commit -m "SSE Server"
git branch -M main
git remote add origin https://github.com/TEU_USERNAME/vendfy-sse-server.git
git push -u origin main
```

---

## 🚀 PASSO 3: Deploy Coolify (5 min)

### 3.1 Criar Aplicação

1. Coolify → Projeto → **"+ Add Resource"**
2. **Application**
3. **Source:** GitHub
4. **Repo:** `vendfy-sse-server`
5. **Port:** `3002`
6. **Create**

### 3.2 Variáveis Ambiente

Adicionar estas 3:

```
PORT=3002
DATABASE_URL=postgresql://... (do Passo 1.2)
NODE_ENV=production
```

### 3.3 Deploy

1. **"Deploy"**
2. Aguardar 2-3 min
3. ✅ Ver logs:
   ```
   ✅ Conexão PostgreSQL OK
   ✅ Tabela encontrada
   ✅ Servidor pronto!
   ```

---

## 🧪 PASSO 4: Testar (2 min)

### 4.1 Health Check

Browser:
```
https://TUA_URL_COOLIFY/health
```

Deve ver:
```json
{"status":"ok","clients":0,...}
```

### 4.2 Teste SSE

DevTools → Console:

```javascript
const es = new EventSource('https://TUA_URL/events/351915405729');
es.onmessage = e => console.log(JSON.parse(e.data));
```

Envia mensagem WhatsApp → deve aparecer em até 2s!

---

## 🔌 PASSO 5: Integrar Frontend (3 min)

No `App.tsx`, adicionar:

```typescript
useEffect(() => {
  if (!selectedId) return;

  const eventSource = new EventSource(
    `https://TUA_URL_SSE/events/${selectedId}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === selectedId) {
        return {
          ...conv,
          mensagens: data.messages
        };
      }
      return conv;
    }));
  };

  return () => eventSource.close();
}, [selectedId]);
```

---

## ✅ CHECKLIST FINAL

- [ ] DATABASE_URL copiada
- [ ] Repositório GitHub criado
- [ ] Código enviado para GitHub
- [ ] Aplicação criada no Coolify
- [ ] Variáveis configuradas
- [ ] Deploy concluído com sucesso
- [ ] Health check responde OK
- [ ] SSE funciona no browser
- [ ] Frontend integrado

---

## 🎉 PRONTO!

**Tempo real funcionando! Mensagens chegam em 2 segundos!** ⚡

---

## 🆘 PROBLEMAS?

### DATABASE_URL não funciona?

**Formato correto:**
```
postgresql://usuario:senha@host:porta/database
```

**Testar:**
```bash
psql "postgresql://..."
\dt
# Deve listar tabelas incluindo n8n_fila_mensagens
```

### Tabela não encontrada?

**Verificar no n8n PostgreSQL:**
```sql
SELECT * FROM n8n_fila_mensagens LIMIT 1;
```

**Se não existir, workflow do n8n precisa criar!**

### Mensagens não chegam?

1. **Verifica logs** do SSE server
2. **Envia mensagem** WhatsApp de teste
3. **Aguarda até 2s**
4. **Verifica tabela:**
   ```sql
   SELECT * FROM n8n_fila_mensagens 
   ORDER BY timestamp DESC LIMIT 5;
   ```

---

## 📊 NEXT STEPS

Agora que funciona:

1. ✅ Testa com múltiplos clientes
2. ✅ Monitora logs no Coolify
3. ✅ Ajusta polling se necessário (default: 2s)
4. 🚀 Usa em produção!

**Mensagens em tempo real = CRM profissional!** 💪
