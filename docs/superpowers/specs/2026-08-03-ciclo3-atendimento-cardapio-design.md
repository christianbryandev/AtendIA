# Ciclo 3 — Atendimento, cardápio e conta

Data: 2026-08-03
Status: aprovado, pronto para virar plano de implementação

## Objetivo

Fazer um restaurante real ser atendido pela IA no WhatsApp, com o lojista podendo
supervisionar e intervir, e deixar a plataforma vendável para outros restaurantes.

## Contexto e prazo

O AtendIA nasceu de um contrato com um cliente, e o produto está sendo
generalizado para venda. O contrato prevê: implantação do CRM, configuração das
automações, organização da base de contatos, fluxos automáticos de atendimento,
campanhas de reativação, estratégias de fidelização e IA de apoio ao atendimento.
**PDV, controle de caixa e PIX não estão no contrato.**

Prazo: 22/08/2026. Até lá a plataforma precisa atender um restaurante real e
estar pronta para venda.

Estado ao iniciar o ciclo: site publicado em `atendiarp.com.br`, backend no
Render, cadastro e cobrança funcionando de ponta a ponta em produção.

## Escopo

**Dentro:** tabela de mensagens e conversas, memória de conversa na IA, cadastro
manual de cardápio, tela de conectar WhatsApp, caixa de entrada com resposta
manual e tempo real, recuperação de senha, menu lateral.

**Fora:** importação de cardápio por iFood, PDF e cardápio digital (ficam para
os ciclos seguintes, mas todas as quatro formas devem existir ao final do
projeto); foto de produto; PDV e controle de caixa; templates da Meta enquanto
não aprovados.

## Dependências externas

| Item | Situação em 03/08/2026 |
|---|---|
| Verificação da empresa na Meta | **aprovada** |
| Verificação de provedora de tecnologia | em análise — destrava conexão self-service |
| Templates de mensagem | não submetidos — necessários para campanhas e para retomar conversa fora da janela |
| Chaves OpenAI e Groq | valores de exemplo; sem elas a IA não responde |
| Resend | não contratado; domínio já existe |

O número de teste da Meta funciona sem a verificação de provedora e conversa com
até 5 números pré-cadastrados. Todo o ciclo pode ser validado com ele.

## Regras da Meta que moldam o produto

**Janela de 24 horas.** Só é possível enviar mensagem livre até 24 horas depois
da última mensagem *do cliente*. Vale para a IA e para o lojista igualmente. Na
prática a IA raramente esbarra nisso, porque responde em segundos; quem esbarra é
o humano que volta na conversa horas depois.

**Fora da janela, só template aprovado.** Isso atinge dois casos: retomar
atendimento no dia seguinte, e as campanhas de reativação previstas no contrato,
que por definição são fora da janela. Enviar um template reabre a janela.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Cardápio no ciclo 3 | Só digitação manual; iFood, PDF e cardápio digital nos ciclos seguintes |
| Retomada da IA após intervenção | Automática após 30 min sem mensagem nova na conversa, avaliada na chegada da mensagem seguinte; mais botão de devolver |
| Atualização da caixa de entrada | Supabase Realtime |
| Janela de 24h fechada | Campo bloqueado com explicação; contador de tempo restante quando aberta |
| Conectar WhatsApp | Configuração manual agora; botão automático quando a verificação de provedora sair |
| Áudio | Transcrição mais o arquivo guardado para ouvir |

## Fundação de mensagens

### Tabela `mensagens`

`restaurante_id`, telefone do cliente, direção (`recebida`/`enviada`), autor
(`cliente`/`ia`/`lojista`), texto, tipo (`texto`/`audio`), transcrição, URL do
áudio, `whatsapp_message_id`, status de entrega e data. Índice por
(`restaurante_id`, telefone, data) — é a consulta que a caixa de entrada faz o
tempo todo.

### Tabela `conversas`

`restaurante_id`, telefone do cliente, data da última mensagem **do cliente**
(define a janela de 24h), `sob_controle_humano` e desde quando, data da última
mensagem qualquer (ordena a lista).

Separar as duas tabelas permite listar 50 conversas sem ler 10 mil mensagens, e
permite a IA saber se está pausada sem varrer histórico.

### Mudanças no webhook do WhatsApp

Ordem de operações:

1. Gravar a mensagem recebida **antes** de chamar a IA. Se a IA falhar, a
   mensagem do cliente continua registrada e visível — o lojista vê que alguém
   falou com ele. Gravando depois, uma falha faria a mensagem sumir sem rastro.
2. Atualizar `conversas` (última mensagem do cliente, que reabre a janela).
3. Se `sob_controle_humano`, parar aqui: não chamar a IA, não consumir crédito.
4. Buscar as últimas mensagens da conversa e passar em `historicoConversa`.
5. Gravar a resposta da IA.

### Memória da conversa

`processCustomerMessageWithAI` já aceita `historicoConversa`, mas o webhook
sempre passa vazio: hoje cada mensagem é respondida isoladamente, e a IA não liga
"quero uma pizza grande" a "de calabresa". Com a tabela de mensagens, o histórico
passa a alimentar esse parâmetro.

### Áudio

Baixado da Meta no momento em que chega — o link deles expira — e guardado em
bucket privado do Supabase Storage, separado por restaurante. A transcrição já
acontece hoje para a IA entender; passa a ser gravada.

## Cardápio

Tela `/app/cardapio`. As tabelas `categorias_cardapio`, `produtos_cardapio`,
`complementos` e `produto_complementos` já existem desde o ciclo 1 — falta a
interface.

- Categorias com ordenação; produtos com nome, descrição, preço e
  disponibilidade.
- Produto indisponível não é apagado: apagar perderia o histórico de pedidos que
  aponta para ele.
- Complementos reaproveitáveis entre produtos ("borda de catupiry" cadastrada uma
  vez, associada a todas as pizzas).
- Preço aceita só valor positivo com duas casas, formatado em reais durante a
  digitação. Erro de preço custa dinheiro em toda venda daquele item.
- Sem foto de produto: a landing não promete, a IA não usa imagem, e puxaria
  armazenamento e redimensionamento.

### O cardápio precisa chegar à IA

Hoje o agente responde sem saber o que o restaurante vende. Uma função lê o
cardápio do banco e monta um texto compacto para o prompt, com nome, preço e
complementos de cada item **disponível**. Roda a cada mensagem, então precisa ser
barata; um cardápio de 40 itens gera algo em torno de 600 palavras.

Produto marcado como indisponível não entra no texto, então a IA não oferece o
que acabou.

## Conectar WhatsApp

Tela `/app/configuracoes`, primeira seção. As colunas
`restaurantes.meta_phone_number_id` e `restaurantes.meta_access_token` já
existem.

- O lojista informa o ID do número e o token de acesso.
- O token é gravado **criptografado** com as funções de `src/utils/crypto.ts` — o
  `schema.sql` já documenta essa exigência. Esse token dá acesso total ao
  WhatsApp do restaurante.
- Botão de testar a conexão, que chama a API da Meta e confirma que o token vale
  para aquele número, com resultado em português. Sem isso o lojista salva dado
  errado e só descobre quando um cliente reclama.
- A tela mostra o estado da conexão e avisa quando não há cardápio cadastrado —
  conectar sem cardápio faz a IA atender sem saber o que vender.

A URL de webhook é única para todos os restaurantes: a Meta informa para qual
número a mensagem foi, e o código encontra o restaurante por
`meta_phone_number_id`, como já faz hoje. Do lado do servidor, conectar um
restaurante é preencher essas duas colunas.

A tela nasce preparada para o botão automático: quando a verificação de provedora
sair, o login do Facebook preenche esses mesmos campos e nada é jogado fora.

## Caixa de entrada

Tela `/app/atendimento`, duas colunas.

**Lista:** conversas ordenadas pela mensagem mais recente, com nome do cliente
(do CRM, que já captura), trecho da última mensagem, horário e indicador de quem
está sob controle humano.

**Conversa:** histórico distinguindo cliente, IA e lojista — importa saber o que
a IA prometeu em nome dele. Áudio com player e transcrição.

**Assumir e devolver:** botão marca `sob_controle_humano`; o webhook checa esse
campo antes de chamar a IA. Um botão devolve o controle na hora.

A devolução automática após 30 minutos é avaliada **preguiçosamente, na chegada
da próxima mensagem do cliente** — não por trabalho agendado. Quando o webhook
recebe uma mensagem de conversa sob controle humano, ele compara a data da última
mensagem da conversa (de qualquer autor) com o instante atual; passados 30
minutos, devolve o controle à IA e segue o fluxo normal.

Fazer assim elimina a necessidade de um agendador: o Render cobra à parte por
cron job, e um agendador que roda de minuto em minuto para varrer conversas
ociosas gastaria recurso o tempo todo para agir raramente. O efeito prático é
idêntico, porque a única coisa que a devolução precisa destravar é justamente o
atendimento da próxima mensagem.

**Envio:** reusa `sendWhatsAppTextMessage`. A mensagem é gravada antes de sair,
para aparecer na tela imediatamente; se a Meta recusar, é marcada como falha com
o motivo visível.

**Janela de 24h:** calculada da última mensagem do cliente. Aberta, o campo
funciona e mostra o tempo restante. Fechada, o campo é desabilitado com
explicação. **O backend também recusa**, não só o front — senão uma requisição
direta contornaria.

**Tempo real:** o navegador assina as mudanças de `mensagens` filtradas pelo
restaurante via Supabase Realtime. O JWT que já emitimos é um JWT válido do
Supabase com `sub = restaurante_id`, então as policies de RLS isolam cada
inquilino sem autenticação nova.

A assinatura em tempo real é **só de leitura**. O envio continua pela nossa API,
para toda mensagem que sai passar pela checagem de janela, de crédito e de token
— coisas que o banco não valida.

**Risco a tratar com teste:** é a primeira vez que o frontend fala direto com o
Supabase. RLS frouxa faria um restaurante ver mensagem de outro.

## Recuperação de senha

- Token aleatório; o **hash** é guardado em `tokens_recuperacao`, com validade de
  1 hora e uso único. Guardar o hash segue o mesmo princípio da senha.
- Resposta sempre igual, exista a conta ou não: "se este e-mail estiver
  cadastrado, você receberá as instruções". Mesmo cuidado já adotado no login e
  no CNPJ duplicado.
- Limite de tentativas por e-mail, para o formulário não virar ferramenta de spam
  contra os próprios clientes.
- Senha nova gravada com bcrypt; token marcado como usado.

**Resend** é a única dependência externa nova do ciclo. Módulo
`src/services/email/`. Aproveitar para entregar junto o **aviso de cota por
e-mail**, pendente do ciclo 2 — mesmo serviço, custo marginal quase zero.

Cuidado de entrega: e-mail de domínio novo cai em spam com facilidade. O Resend
exige SPF e DKIM no DNS, e a Hostinger já tem SPF configurado para o e-mail dela
— será preciso incluir o Resend no mesmo registro, senão os dois conflitam.

## Menu lateral

O `PainelLayout` existente (que hoje só põe a faixa de cota e a trava de acesso)
ganha barra lateral fixa, marca, nome do restaurante e botão de sair — que hoje
não existe em lugar nenhum.

```
Atendimento · Pedidos · CRM · Cardápio · Configurações · Assinatura · Créditos
```

Retrátil em telas pequenas: o lojista vai abrir no celular durante o movimento.

Unificar a paleta das telas antigas, que usam azul enquanto a marca é verde.

## Erros

| Falha | Comportamento |
|---|---|
| OpenAI ou Groq fora do ar | Mensagem gravada e visível; lojista responde na mão; crédito estornado, como já ocorre |
| Token do WhatsApp expirado | Envio falha, mensagem marcada como não entregue, aviso nas configurações |
| Áudio não baixa da Meta | Transcrição salva; player indica áudio indisponível |
| Cliente escreve enquanto o lojista digita | Realtime insere acima; nada se perde |
| Cardápio vazio com WhatsApp conectado | Aviso destacado nas configurações e no painel |
| Supabase Realtime cai | Tela continua funcionando com recarga manual |

## Testes

Além do padrão do projeto, três obrigatórios:

1. **Isolamento entre restaurantes** na caixa de entrada, contra o banco real:
   dois restaurantes de teste, prova de que um não enxerga a conversa do outro.
2. **Janela de 24 horas** com relógio controlado: aberta, quase fechando,
   fechada.
3. **Pausa da IA**: conversa sob controle humano não chama a IA nem gasta
   crédito.

## Ordem de implementação

Fundação de mensagens → cardápio → conectar WhatsApp → caixa de entrada →
recuperação de senha → menu lateral.

Ordenado por risco: se faltar tempo, o que fica de fora é o menos crítico.

## Validação final

Conectar o número de teste da Meta ao celular do dono e fazer um pedido de ponta
a ponta: mensagem de texto, áudio, resposta da IA, intervenção manual do lojista.
Não depende de nenhuma aprovação pendente.

## Nota para os ciclos seguintes

- Importação de cardápio: iFood (código já existe em `src/services/ifood/`), PDF
  e foto com extração por IA e revisão obrigatória, cardápio digital.
- Templates da Meta, quando aprovados: botão de reabrir conversa fora da janela e
  campanhas de reativação de fato funcionais.
- Ligar o TTS: `src/services/ai/openai-tts.ts` está escrito e não é chamado por
  ninguém. A landing vende resposta em áudio e a cota já cobra 8 créditos por
  isso.
- Janela de 7 dias do reembolso: mostrar ao lojista até quando pode pedir, e ao
  dono antes de devolver.
- Canonical nos hostnames: `atendiarp.com.br` e `www` servem o mesmo conteúdo sem
  tag canonical.
