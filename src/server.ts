import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { supabase, supabaseAdmin, getTenantSupabaseClient } from './config/supabase.js';
import { transcribeAudioWithGroq } from './services/ai/groq-stt.js';
import { processCustomerMessageWithAI } from './services/ai/openai-agent.js';
import { sendWhatsAppTextMessage, downloadWhatsAppMedia } from './services/whatsapp/meta-cloud-api.js';
import { upsertCustomerInCRM, runReactivationCampaign } from './services/crm/reactivation.js';
import { importarCardapioiFood } from './services/ifood/ifood-api.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ------------------------------------------------------------------
// 1. WEBHOOK DA META WHATSAPP CLOUD API (GET para Validação)
// ------------------------------------------------------------------
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === env.META_VERIFY_TOKEN) {
    console.log('[Meta Webhook Verified] Sucesso na validação do Webhook!');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ------------------------------------------------------------------
// 2. RECEBIMENTO ASSÍNCRONO DE MENSAGENS (USO RESTRITO DA SERVICE_ROLE)
// ------------------------------------------------------------------
app.post('/webhook/whatsapp', (req, res) => {
  res.status(200).send('EVENT_RECEIVED');

  setImmediate(async () => {
    try {
      const body = req.body;
      if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
          const fromPhone = message.from;
          const messageType = message.type;

          const fromPhoneNumberId = value?.metadata?.phone_number_id;
          if (!fromPhoneNumberId) {
            console.log('[Webhook] Mensagem ignorada: phone_number_id ausente.');
            return;
          }

          // Uso do cliente Admin para buscar o tenant correto com base no número destino
          const { data: restaurante } = await supabaseAdmin
            .from('restaurantes')
            .select('id, meta_access_token')
            .eq('meta_phone_number_id', fromPhoneNumberId)
            .single();

          if (!restaurante || !restaurante.id) {
            console.error(`[Webhook] ERRO: Nenhum restaurante encontrado para o número ${fromPhoneNumberId}.`);
            return;
          }

          const restauranteId = restaurante.id;
          const metaToken = restaurante.meta_access_token || env.META_WHATSAPP_TOKEN;

          let textoEntrada = '';

          if (messageType === 'audio') {
            console.log(`[Áudio Assíncrono] De: ${fromPhone} | Baixando da Meta e Transcrevendo...`);
            const audioId = message.audio?.id;
            if (audioId) {
              const audioBuffer = await downloadWhatsAppMedia(audioId, metaToken);
              textoEntrada = await transcribeAudioWithGroq(audioBuffer, 'audio.ogg');
            }
          } else if (messageType === 'text') {
            textoEntrada = message.text.body;
          }

          if (textoEntrada) {
            console.log(`[Mensagem Cliente Assíncrona] De: ${fromPhone} | Texto: "${textoEntrada}"`);

            await upsertCustomerInCRM({
              restauranteId,
              telefoneWhatsApp: fromPhone,
            });

            const { respostaTexto } = await processCustomerMessageWithAI({
              restauranteId,
              telefoneCliente: fromPhone,
              mensagemTexto: textoEntrada,
            });

            await sendWhatsAppTextMessage({
              toPhoneNumber: fromPhone,
              text: respostaTexto,
              phoneNumberId: fromPhoneNumberId,
              token: metaToken
            });
          }
        }
      }
    } catch (error) {
      console.error('[Background Webhook Processing Error]:', error);
    }
  });
});

// ------------------------------------------------------------------
// 3. ROTA DE LOGIN QUE EMITE JWT OFICIAL RECONHECIDO PELO SUPABASE RLS
// ------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
  }

  const { data: restaurante, error } = await supabaseAdmin
    .from('restaurantes')
    .select('id, nome, email_acesso, senha_acesso')
    .eq('email_acesso', email)
    .single();

  if (error || !restaurante) {
    return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
  }

  const senhaValida = restaurante.senha_acesso.startsWith('$2b$') 
    ? await bcrypt.compare(password, restaurante.senha_acesso)
    : restaurante.senha_acesso === password;

  if (!senhaValida) {
    return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
  }

  // ASSINATURA DO JWT USANDO O SUPABASE_JWT_SECRET DO PROJETO!
  // O PostgreSQL valida esta assinatura e extrai a claim user_metadata.restaurante_id nas políticas de RLS!
  const jwtSecret = env.SUPABASE_JWT_SECRET || 'super-secret-supabase-jwt-key-default';

  const userJwtToken = jwt.sign(
    {
      sub: restaurante.id,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: {
        restaurante_id: restaurante.id,
        nome: restaurante.nome,
      },
    },
    jwtSecret,
    { expiresIn: '12h' } // Expiração de 12 horas (Cobre um turno inteiro de restaurante)
  );

  return res.json({
    success: true,
    token: userJwtToken,
    expiresIn: 43200, // 12 horas (43200s)
    restauranteId: restaurante.id,
    restauranteNome: restaurante.nome,
    message: 'Login realizado com sucesso!',
  });
});

// ------------------------------------------------------------------
// 3.1 ROTA DE REFRESH TOKEN (RENOVAÇÃO DE SESSÃO DO PDV)
// ------------------------------------------------------------------
app.post('/api/auth/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = env.SUPABASE_JWT_SECRET || 'super-secret-supabase-jwt-key-default';

  try {
    // 1. Verifica o token ignorando a expiração atual (para poder renovar tokens recém-expirados)
    const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true }) as jwt.JwtPayload;

    // 2. Limite de segurança: Só permite renovar se o token expirou há menos de 7 dias
    const tokenExp = decoded.exp || 0;
    const agora = Math.floor(Date.now() / 1000);
    const seteDiasEmSegundos = 7 * 24 * 60 * 60;

    // Se o token expirou há MAIS de 7 dias, bloqueia e obriga a fazer um novo login manual
    if (agora - tokenExp > seteDiasEmSegundos) {
      return res.status(401).json({ success: false, error: 'Sessão expirada permanentemente. Faça login novamente.' });
    }

    // [NOVO]: Consulta rápida no banco apenas no momento do refresh (1x a cada 12h)
    // Isso age como um "Kill Switch". Se o restaurante for desativado (ativo = false), o refresh é negado.
    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('ativo')
      .eq('id', decoded.sub)
      .single();

    if (!restaurante || restaurante.ativo === false) {
      return res.status(401).json({ success: false, error: 'Conta desativada ou inexistente. Acesso revogado.' });
    }

    // 3. Gera um NOVO token de 12h mantendo as mesmas informações
    const novoToken = jwt.sign(
      {
        sub: decoded.sub,
        role: decoded.role,
        aud: decoded.aud,
        user_metadata: decoded.user_metadata,
      },
      jwtSecret,
      { expiresIn: '12h' }
    );

    return res.json({ success: true, token: novoToken, expiresIn: 43200 });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido.' });
  }
});

// ------------------------------------------------------------------
// 4. ROTAS DE CRM, CAMPANHAS E FIDELIZAÇÃO
// ------------------------------------------------------------------

// Lista contatos do CRM
app.get('/api/crm/clientes', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  const tenantClient = getTenantSupabaseClient(token);

  const { data: clientes, error } = await tenantClient
    .from('clientes_crm')
    .select('*')
    .order('ultimo_pedido_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ total: clientes.length, clientes });
});

// Disparo de campanha de reativação de clientes ausentes
app.post('/api/crm/reativacao', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  
  try {
    const jwtSecret = env.SUPABASE_JWT_SECRET || 'super-secret-supabase-jwt-key-default';
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    
    // O ID seguro do restaurante vem do Token validado, não do body da requisição
    const restauranteIdSeguro = decoded.sub;
    const { diasAusente } = req.body;

    if (!restauranteIdSeguro) {
      return res.status(400).json({ error: 'ID do restaurante ausente no token' });
    }

    const resultado = await runReactivationCampaign(restauranteIdSeguro, diasAusente || 15);
    return res.json(resultado);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
});

// ------------------------------------------------------------------
// 4.1 INTEGRAÇÃO iFOOD
// ------------------------------------------------------------------
app.post('/api/ifood/sync', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  
  try {
    const jwtSecret = env.SUPABASE_JWT_SECRET || 'super-secret-supabase-jwt-key-default';
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    
    const restauranteIdSeguro = decoded.sub;

    if (!restauranteIdSeguro) {
      return res.status(400).json({ error: 'ID do restaurante ausente no token' });
    }

    const resultado = await importarCardapioiFood(restauranteIdSeguro);
    return res.json(resultado);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao sincronizar com iFood.' });
  }
});

// ------------------------------------------------------------------
// 5. ROTAS DO PDV (FRENTE DE CAIXA & COZINHA)
// ------------------------------------------------------------------

app.get('/api/pdv/pedidos', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  const tenantClient = getTenantSupabaseClient(token);

  const { data: pedidos, error } = await tenantClient
    .from('pedidos')
    .select('*, clientes_crm(nome, telefone_whatsapp)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(pedidos);
});

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Servidor SaaS Delivery & CRM com IA Rodando!`);
  console.log(`📡 URL Local: http://localhost:${PORT}`);
  console.log(`🔗 Webhook WhatsApp: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`==================================================`);
});
