import express from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env, getJwtSecret, getCronSecret } from './config/env.js';
import { supabase, supabaseAdmin, getTenantSupabaseClient } from './config/supabase.js';
import { transcribeAudioWithGroq } from './services/ai/groq-stt.js';
import { processCustomerMessageWithAI } from './services/ai/openai-agent.js';
import { sendWhatsAppTextMessage, downloadWhatsAppMedia } from './services/whatsapp/meta-cloud-api.js';
import { upsertCustomerInCRM, runReactivationCampaign } from './services/crm/reactivation.js';
import { importarCardapioiFood } from './services/ifood/ifood-api.js';
import { decrypt } from './utils/crypto.js';
import { validarPayloadCadastro } from './services/cadastro/criar-conta.js';
import { autenticar } from './middleware/autenticar.js';
import { criarSessaoAssinatura, criarSessaoPacote, criarSessaoPortal } from './services/billing/checkout.js';

const app = express();

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
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
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody;

  if (!signature || typeof signature !== 'string' || !signature.startsWith('sha256=') || !rawBody) {
    console.error('[Webhook] Falha na validação: Assinatura ou rawBody ausente/inválido.');
    return res.status(401).send('Unauthorized');
  }

  const expectedSignature = `sha256=${crypto.createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`;
  
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    console.error('[Webhook] Falha na validação: Assinatura não confere.');
    return res.status(401).send('Unauthorized');
  }

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
          const messageId = message.id; // Captura ID para idempotência

          const fromPhoneNumberId = value?.metadata?.phone_number_id;
          if (!fromPhoneNumberId) {
            console.log('[Webhook] Mensagem ignorada: phone_number_id ausente.');
            return;
          }

          // 1. CHECAGEM DE IDEMPOTÊNCIA
          if (messageId) {
            const { error: erroIdempotencia } = await supabaseAdmin
              .from('webhook_eventos_processados')
              .insert([{ message_id: messageId }]);

            // Se der erro de unique constraint, significa que já processamos essa mensagem
            if (erroIdempotencia) {
              console.log(`[Webhook] Mensagem ${messageId} já processada. Ignorando duplicata.`);
              return;
            }
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
          let metaToken = env.META_WHATSAPP_TOKEN;
          
          if (restaurante.meta_access_token) {
            try {
              metaToken = decrypt(restaurante.meta_access_token);
            } catch (err) {
              console.error(`[Webhook] ERRO: Falha ao decifrar token do restaurante ${restauranteId}.`);
              return;
            }
          }

          // 2. CÁLCULO E CONSUMO DE CRÉDITOS (ANTES DE PROCESSAR)
          // 8 para áudio, alinhado com o que a landing vende. O número reflete o
          // custo real de STT + LLM + TTS; o TTS ainda não está ligado (ciclo 3),
          // mas a cota já é dimensionada para ele.
          const custoCreditos = messageType === 'audio' ? 8 : 1;
          const { data: creditosAprovados, error: erroCreditos } = await supabaseAdmin
            .rpc('consumir_creditos_ia', {
              p_restaurante_id: restauranteId,
              p_qtd: custoCreditos,
              p_tipo: messageType
            });

          if (erroCreditos || !creditosAprovados) {
            console.log(`[Webhook] Restaurante ${restauranteId} sem créditos suficientes. Abortando IA.`);
            await sendWhatsAppTextMessage({
              toPhoneNumber: fromPhone,
              text: 'Nosso atendimento automático está temporariamente indisponível. Entre em contato diretamente com a loja.',
              phoneNumberId: fromPhoneNumberId,
              token: metaToken
            });
            return;
          }

          // 3. BLOCO TRY-CATCH ISOLADO PARA REEMBOLSO EM CASO DE FALHA DA IA
          let creditoJaEstornado = false;
          try {
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
            } else {
              console.log(`[Webhook] Mensagem ignorada (tipo não suportado ou vazia). Reembolsando.`);
              
              await supabaseAdmin.rpc('reembolsar_creditos_ia', {
                p_restaurante_id: restauranteId,
                p_qtd: custoCreditos,
                p_tipo: messageType,
                p_motivo: 'Tipo de mensagem não suportado ou mídia vazia'
              });
              creditoJaEstornado = true;

              await sendWhatsAppTextMessage({
                toPhoneNumber: fromPhone,
                text: 'Desculpe, ainda não consigo entender esse tipo de mensagem (figurinha, localização, etc.). Por favor, envie um texto ou áudio!',
                phoneNumberId: fromPhoneNumberId,
                token: metaToken
              });
            }
          } catch (iaError: any) {
            console.error(`[Webhook] Falha no processamento da IA para a mensagem ${messageId}:`, iaError);
            
            if (!creditoJaEstornado) {
              // Reembolso Automático
              await supabaseAdmin.rpc('reembolsar_creditos_ia', {
                p_restaurante_id: restauranteId,
                p_qtd: custoCreditos,
                p_tipo: messageType,
                p_motivo: `Falha na API: ${iaError.message}`
              });
            }

            await sendWhatsAppTextMessage({
              toPhoneNumber: fromPhone,
              text: 'Desculpe, ocorreu um erro interno ao processar sua mensagem. Por favor, tente novamente em instantes ou contate a loja.',
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

  // 1. Busca o usuário pelo e-mail
  const { data: usuario, error: errorUsuario } = await supabaseAdmin
    .from('usuarios')
    .select('id, restaurante_id, senha_hash, nome')
    .eq('email', email)
    .single();

  if (errorUsuario || !usuario) {
    // Retorna erro genérico para não vazar se o e-mail existe
    return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos.' });
  }

  // 2. Valida a senha obrigatoriamente com bcrypt
  const senhaValida = await bcrypt.compare(password, usuario.senha_hash);

  if (!senhaValida) {
    return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos.' });
  }

  // 3. Emite o JWT usando a estrutura exata que o Postgres RLS espera
  const jwtSecret = getJwtSecret();

  const userJwtToken = jwt.sign(
    {
      sub: usuario.restaurante_id,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: {
        usuario_id: usuario.id,
        restaurante_id: usuario.restaurante_id,
        nome: usuario.nome,
      },
    },
    jwtSecret,
    { expiresIn: '12h' }
  );

  return res.json({
    success: true,
    token: userJwtToken,
    expiresIn: 43200, // 12 horas
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
  const jwtSecret = getJwtSecret();

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
// 3.2 CADASTRO DE NOVO RESTAURANTE
// ------------------------------------------------------------------
// A conta nasce antes do pagamento, com assinatura 'pendente'. Quem
// abandona o Checkout retoma pelo login, sem recadastrar.
//
// Mensagem genérica para conflito de CNPJ (ver comentário no uso
// abaixo): propositalmente vaga para não permitir enumeração da
// carteira de clientes por CNPJ.
const MENSAGEM_CADASTRO_DUPLICADO = 'Não foi possível concluir o cadastro com estes dados. Se você já é cliente, entre com sua conta.';

app.post('/api/auth/cadastro', async (req, res) => {
  const validacao = validarPayloadCadastro(req.body);

  if (!validacao.ok) {
    return res.status(validacao.status).json({ success: false, error: validacao.erro });
  }

  const d = validacao.dados;

  // Unicidade antes de criar qualquer coisa, para não deixar
  // restaurante órfão quando o insert seguinte falhar.
  const { data: emailExistente } = await supabaseAdmin
    .from('usuarios').select('id').eq('email', d.email).maybeSingle();

  if (emailExistente) {
    return res.status(409).json({ success: false, error: 'Já existe uma conta com este e-mail.' });
  }

  const { data: cnpjExistente } = await supabaseAdmin
    .from('restaurantes').select('id').eq('cnpj', d.cnpj).maybeSingle();

  if (cnpjExistente) {
    // Mensagem propositalmente vaga: diferente do e-mail (que é dado
    // pessoal de quem está tentando logar), o CNPJ é dado empresarial
    // público. Uma mensagem específica de "CNPJ já cadastrado" permite
    // a um concorrente descobrir a carteira de clientes testando um
    // CNPJ por vez. Não troque por uma mensagem mais específica.
    return res.status(409).json({ success: false, error: MENSAGEM_CADASTRO_DUPLICADO });
  }

  const { data: restaurante, error: erroRestaurante } = await supabaseAdmin
    .from('restaurantes')
    .insert([{
      nome: d.restauranteNome,
      cnpj: d.cnpj,
      cep: d.cep,
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento || null,
      bairro: d.bairro,
      cidade: d.cidade,
      uf: d.uf,
      ativo: true,
    }])
    .select('id')
    .single();

  if (erroRestaurante || !restaurante) {
    console.error('[Cadastro] Falha ao criar restaurante:', erroRestaurante);

    // Corrida: outro cadastro com o mesmo CNPJ venceu a checagem de
    // unicidade acima e inseriu primeiro. O Postgres devolve 23505
    // (unique_violation), que o supabase-js expõe em error.code.
    // Respondemos 409 em vez do genérico de "tente novamente", porque
    // retentar com o mesmo CNPJ falharia sempre.
    if (erroRestaurante?.code === '23505') {
      return res.status(409).json({ success: false, error: MENSAGEM_CADASTRO_DUPLICADO });
    }

    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const senhaHash = await bcrypt.hash(d.senha, 10);

  const { data: usuario, error: erroUsuario } = await supabaseAdmin
    .from('usuarios')
    .insert([{ restaurante_id: restaurante.id, email: d.email, senha_hash: senhaHash, nome: d.nome }])
    .select('id')
    .single();

  if (erroUsuario || !usuario) {
    console.error('[Cadastro] Falha ao criar usuário, revertendo restaurante:', erroUsuario);
    const { error: erroReversao } = await supabaseAdmin.from('restaurantes').delete().eq('id', restaurante.id);
    if (erroReversao) {
      // Sem isso, um restaurante órfão (sem usuário nem assinatura)
      // fica no banco sem nenhum rastro para investigação posterior.
      console.error(`[Cadastro] Falha ao reverter restaurante orfao ${restaurante.id}:`, erroReversao);
    }

    // Corrida: outro cadastro com o mesmo e-mail venceu a checagem de
    // unicidade acima. Mesma lógica do CNPJ: 409, não "tente novamente".
    if (erroUsuario?.code === '23505') {
      return res.status(409).json({ success: false, error: 'Já existe uma conta com este e-mail.' });
    }

    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const { error: erroAssinatura } = await supabaseAdmin
    .from('assinaturas')
    .insert([{ restaurante_id: restaurante.id, status: 'pendente' }]);

  if (erroAssinatura) {
    console.error('[Cadastro] Falha ao criar assinatura, revertendo:', erroAssinatura);
    const { error: erroReversao } = await supabaseAdmin.from('restaurantes').delete().eq('id', restaurante.id);
    if (erroReversao) {
      console.error(`[Cadastro] Falha ao reverter restaurante orfao ${restaurante.id}:`, erroReversao);
    }
    return res.status(500).json({ success: false, error: 'Não foi possível criar a conta. Tente novamente.' });
  }

  const token = jwt.sign(
    {
      sub: restaurante.id,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { usuario_id: usuario.id, restaurante_id: restaurante.id, nome: d.nome },
    },
    getJwtSecret(),
    { expiresIn: '12h' }
  );

  return res.status(201).json({ success: true, token, expiresIn: 43200 });
});

// ------------------------------------------------------------------
// 3.3 COBRANÇA: CHECKOUT, PACOTES E PORTAL
// ------------------------------------------------------------------
app.post('/api/billing/checkout', autenticar, async (req, res) => {
  try {
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('email')
      .eq('restaurante_id', req.restauranteId)
      .limit(1)
      .maybeSingle();

    const url = await criarSessaoAssinatura(req.restauranteId!, usuario?.email || '');
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao criar checkout:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});

app.post('/api/billing/pacote', autenticar, async (req, res) => {
  try {
    const url = await criarSessaoPacote(req.restauranteId!, req.body?.pacoteId);
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao criar compra de pacote:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});

app.post('/api/billing/portal', autenticar, async (req, res) => {
  try {
    const url = await criarSessaoPortal(req.restauranteId!);
    return res.json({ success: true, url });
  } catch (erro: any) {
    console.error('[Billing] Falha ao abrir o portal:', erro);
    return res.status(400).json({ success: false, error: erro.message });
  }
});

// ------------------------------------------------------------------
// 4. ROTAS DE DASHBOARD E MÉTRICAS
// ------------------------------------------------------------------
app.get('/api/dashboard/metricas', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    const restauranteId = decoded.sub;

    if (!restauranteId) {
      return res.status(400).json({ error: 'ID do restaurante ausente no token' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const isoDate = thirtyDaysAgo.toISOString();

    // 1. Faturamento & Pedidos
    const { data: pedidosData, error: errPedidos } = await supabaseAdmin
      .from('pedidos')
      .select('valor_total, status')
      .eq('restaurante_id', restauranteId)
      .gte('created_at', isoDate);

    if (errPedidos) throw errPedidos;

    let faturamento = 0;
    let pedidosConcluidos = 0;

    for (const pedido of pedidosData) {
      if (pedido.status === 'CONCLUIDO') {
        faturamento += Number(pedido.valor_total);
        pedidosConcluidos += 1;
      }
    }

    const ticketMedio = pedidosConcluidos > 0 ? faturamento / pedidosConcluidos : 0;

    // 2. Novos Clientes (Cadastrados nos últimos 30 dias)
    const { count: novosClientes, error: errClientes } = await supabaseAdmin
      .from('clientes_crm')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .gte('created_at', isoDate);

    if (errClientes) throw errClientes;

    // 3. Consumo e Interações de IA
    const { data: iaData, error: errIa } = await supabaseAdmin
      .from('creditos_ia')
      .select('creditos_consumidos')
      .eq('restaurante_id', restauranteId)
      .gte('created_at', isoDate);

    if (errIa) throw errIa;

    let creditosConsumidos = 0;
    let interacoesIa = 0;

    for (const row of iaData) {
      creditosConsumidos += Number(row.creditos_consumidos);
      if (row.creditos_consumidos > 0) {
        interacoesIa += 1;
      }
    }

    return res.json({
      faturamento,
      pedidosConcluidos,
      ticketMedio,
      novosClientes: novosClientes || 0,
      creditosConsumidos,
      interacoesIa
    });
  } catch (err: any) {
    console.error('[Dashboard API Error]:', err);
    return res.status(500).json({ error: 'Erro ao carregar métricas.' });
  }
});

// ------------------------------------------------------------------
// 5. ROTAS DE CRM, CAMPANHAS E FIDELIZAÇÃO
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
    const jwtSecret = getJwtSecret();
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

// Atualização Manual de Estágio do Kanban (Override Manual)
app.put('/api/crm/estagio', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  
  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    const restauranteId = decoded.sub;

    const { clienteId, novoEstagio, problemaAtivo } = req.body;

    if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });

    // Busca estágio atual para o log
    const { data: cliente, error: fetchErr } = await supabaseAdmin
      .from('clientes_crm')
      .select('estagio_pipeline')
      .eq('id', clienteId)
      .eq('restaurante_id', restauranteId)
      .single();

    if (fetchErr || !cliente) throw new Error('Cliente não encontrado');

    const estagioAnterior = cliente.estagio_pipeline;
    const updateData: any = {};
    let mudouEstagio = false;

    if (novoEstagio && novoEstagio !== estagioAnterior) {
      updateData.estagio_pipeline = novoEstagio;
      updateData.bloqueio_cron_manual = true; // Trava o cron de sobrescrever a decisão manual
      mudouEstagio = true;
    }
    if (problemaAtivo !== undefined) {
      updateData.problema_ativo = problemaAtivo;
    }

    if (Object.keys(updateData).length > 0) {
      await supabaseAdmin.from('clientes_crm').update(updateData).eq('id', clienteId).eq('restaurante_id', restauranteId);
      
      if (mudouEstagio) {
        await supabaseAdmin.from('historico_crm').insert({
          cliente_id: clienteId,
          estagio_anterior: estagioAnterior,
          estagio_novo: novoEstagio,
          motivo: 'manual_lojista'
        });
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atualizar estágio' });
  }
});

// ------------------------------------------------------------------
// 5. CRON JOBS (Chamados externamente pelo Render / AWS)
// ------------------------------------------------------------------
app.post('/api/cron/verificar-inatividade', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  const expectedSecret = getCronSecret();
  
  if (secret !== expectedSecret) {
    return res.status(401).json({ error: 'Acesso não autorizado ao cron' });
  }

  try {
    // Gatilho 4: Chama a RPC que processa o rebaixamento massivo
    const { data: movidos, error } = await supabaseAdmin.rpc('processar_cron_inatividade');
    if (error) throw error;

    return res.json({ success: true, clientes_movidos_para_risco: movidos });
  } catch (err: any) {
    console.error('[CRON Error]:', err);
    return res.status(500).json({ error: 'Erro ao processar cron' });
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
    const jwtSecret = getJwtSecret();
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

// Atualiza o Status do Pedido (Gatilhos 2 e 3 do CRM Kanban)
app.put('/api/pdv/pedidos/:id/status', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  
  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    const restauranteId = decoded.sub;

    const pedidoId = req.params.id;
    const { status } = req.body;

    if (!pedidoId || !status) {
      return res.status(400).json({ error: 'pedidoId e status são obrigatórios' });
    }

    // Busca pedido atual para validar a transição e pegar o cliente
    const { data: pedido, error: fetchErr } = await supabaseAdmin
      .from('pedidos')
      .select('*')
      .eq('id', pedidoId)
      .eq('restaurante_id', restauranteId)
      .single();

    if (fetchErr || !pedido) throw new Error('Pedido não encontrado');

    const statusAnterior = pedido.status;

    // Atualiza status do Pedido
    await supabaseAdmin
      .from('pedidos')
      .update({ status })
      .eq('id', pedidoId)
      .eq('restaurante_id', restauranteId);

    // Gatilhos do Kanban CRM (se houver cliente vinculado)
    if (pedido.cliente_id) {
      // GATILHO 2: Pedido saiu de NOVO para EM_PREPARO (foi pra cozinha)
      if (statusAnterior === 'NOVO' && status === 'EM_PREPARO') {
        await supabaseAdmin.from('clientes_crm').update({
          estagio_pipeline: 'pedido_em_andamento',
          bloqueio_cron_manual: false
        }).eq('id', pedido.cliente_id)
        .eq('restaurante_id', restauranteId);

        await supabaseAdmin.from('historico_crm').insert({
          cliente_id: pedido.cliente_id,
          estagio_anterior: null, // Pode ser dinâmico depois, mas para simplificar
          estagio_novo: 'pedido_em_andamento',
          motivo: 'evento_pedido'
        });
      }

      // GATILHO 3: Pedido CONCLUIDO
      if (statusAnterior !== 'CONCLUIDO' && status === 'CONCLUIDO') {
        const { error: updateErr } = await supabaseAdmin.rpc('atualizar_pedido_concluido', {
          p_cliente_id: pedido.cliente_id,
          p_restaurante_id: restauranteId,
          p_valor_total: pedido.valor_total
        });

        if (updateErr) {
          console.error('[Kanban CRM] Erro ao atualizar gatilho 3 (Concluido):', updateErr);
        }
      }
    }

    return res.json({ success: true, novoStatus: status });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atualizar status do pedido' });
  }
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
