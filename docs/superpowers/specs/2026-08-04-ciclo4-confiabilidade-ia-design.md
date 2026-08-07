# Ciclo 4 — Confiabilidade da IA e do CRM

**Data:** 04/08/2026 (ampliado em 07/08/2026)
**Estado:** aprovado, pronto para virar plano

## Problema mais grave, descoberto em 07/08: o CRM nunca funcionou

A tela de CRM mostra zero clientes. A tabela `clientes_crm` está **vazia**, mesmo depois de conversas reais em produção.

Causa raiz: `src/services/crm/reactivation.ts` importa **`supabase`** (o cliente **anon**) em vez de `supabaseAdmin`. O webhook roda no servidor, sem JWT de usuário, então a RLS bloqueia todo insert. E **nenhuma das cinco consultas do arquivo verifica o `error`** — a falha é engolida, `upsertCustomerInCRM` devolve `undefined`, e o webhook segue como se tivesse dado certo.

É o mesmo defeito que causou três problemas no ciclo 3 — descartar o `error` do Supabase — num módulo que nunca passou por revisão.

**Isso compromete três itens do contrato de uma vez: CRM, fidelização e campanhas de reativação.** Nenhum deles pode funcionar sobre uma base de contatos vazia.

No mesmo arquivo, mais dois defeitos:

- **`runReactivationCampaign` envia texto livre, não template.** Reativação é, por definição, para cliente ausente há 15 ou 30 dias — ou seja, **sempre fora da janela de 24 horas da Meta**. Todas as mensagens seriam recusadas. A função não pode funcionar como está.
- **O cupom `VOLTEI10` e o texto da mensagem estão escritos no código.** Nada é configurável pelo lojista.

`src/services/ifood/ifood-api.ts` também importa o cliente anon. Fora de uso hoje, mas mesmo defeito latente.

## Problema original: a IA inventa o que não sabe

O restaurante real já está sendo atendido em produção. Na primeira conversa de validação, a IA afirmou **"Nós entregamos até as 22h!"** — um horário que não existe em lugar nenhum do sistema. Verificado por busca em `src/services/ai/` e no `schema.sql`: não há lógica nem coluna de horário de funcionamento.

Esse é o tipo de falha mais perigoso do produto, porque é **invisível**. Áudio que falha o lojista percebe; horário inventado chega ao cliente como verdade e ninguém descobre até virar reclamação.

A investigação encontrou três buracos distintos, e só um é "falta campo no banco":

1. **Dado que existe e não chega à IA.** `taxa_entrega_padrao` está em `restaurantes` desde o início, com padrão de R$ 5,00, e **não está no prompt**. A IA inventa uma taxa que já está configurada.
2. **Dado que não existe.** Horário de funcionamento.
3. **Regra anti-invenção estreita demais.** O prompt diz *"JAMAIS INVENTE PREÇOS OU PRODUTOS"* (`openai-agent.ts`, regra 3). Não cobre horário, prazo, taxa, bairro nem promoção. Foi por essa fresta que passou o "até as 22h".

Junto disso, um segundo problema de honestidade: **mídia recebida some sem deixar rastro.** O webhook trata texto e áudio; imagem, documento, vídeo, figurinha e localização caem no ramo genérico e são gravados como `tipo: 'texto'` com texto nulo. Na prática, o cliente manda o comprovante de PIX e o lojista vê uma linha em branco — sem saber que existiu um arquivo.

E um terceiro, do mesmo tipo do item 1 — **dado que existe e não chega à IA:** as tabelas `complementos` e `produto_complementos` existem no banco, mas `montarTextoDoCardapio` não as inclui. A IA não sabe que complementos existem e nunca os oferece, o que reduz o valor de cada pedido. Levantado ao comparar com um concorrente cuja IA pergunta sobre complementos.

**Localização em tempo real** merece destaque próprio entre os tipos não tratados. É o jeito mais comum de um cliente de delivery informar onde está, e evita o erro de endereço digitado. Hoje o cliente manda a localização e a IA responde como se ele não tivesse dito nada.

## Princípio que guia o ciclo

**A IA só afirma o que ela pode verificar; a caixa de entrada mostra tudo que aconteceu de verdade; e o que o contrato promete precisa existir de fato.**

## Decisões tomadas

### 0. Consertar o CRM antes de tudo

Prioridade acima do horário de funcionamento. A IA inventar horário é ruim; a base de contatos não existir compromete três entregas contratadas de uma vez.

O conserto tem três partes:

- **Trocar `supabase` por `supabaseAdmin`** em `reactivation.ts`, e **verificar o `error` em todas as consultas** — o arquivo inteiro precisa passar pela regra que o resto do projeto já segue. O mesmo vale para `ifood-api.ts`, mesmo estando fora de uso.
- **`runReactivationCampaign` passa a usar template aprovado**, não texto livre. É a única forma de alcançar cliente ausente há 15 ou 30 dias, que está sempre fora da janela de 24 horas. O template `reativacao_cupom` já está submetido à Meta.
- **Cupom e texto saem do código.** Viram configuração do lojista, com as variáveis do template.

**Teste que prova o conserto:** uma mensagem recebida cria a linha em `clientes_crm`. Esse teste teria pegado o defeito no dia zero.

### 1. Comportamento quando a IA não sabe

Admite o limite e oferece o humano, **sem prometer prazo**:

> "Não tenho essa informação aqui, mas posso chamar alguém da loja pra te ajudar."

Descartado: "vou confirmar e já te respondo" — cria uma promessa que depende do lojista estar olhando a caixa de entrada, e se ele não estiver o cliente fica no vácuo.

### 2. Critério para campo estruturado versus texto livre

**Se a IA precisa calcular ou comparar, é campo. Se ela só precisa repetir, é texto livre.**

É o único critério não-arbitrário, e evita transformar a configuração num formulário longo que restaurante nenhum preenche.

- **Campo:** horário (compara com a hora atual), taxa de entrega e pedido mínimo (entram em conta).
- **Texto livre:** prazo de entrega, bairros atendidos, formas de pagamento, política de troca.

### 3. Horário com intervalo, não só abre/fecha

Cada dia tem uma **lista de faixas**. Lista vazia = fechado naquele dia; duas faixas cobrem o intervalo entre almoço e jantar, comum em delivery brasileiro.

Sem intervalo, a IA diria "estamos abertos" às 16h com a cozinha parada.

### 4. Fechado: informa e não anota pedido

A IA responde sabendo que está fechado, informa quando abre, e tem **regra dura de não anotar pedido** enquanto fechado.

Descartado registrar o pedido para o lojista retomar depois: a **janela de 24 horas da Meta** inviabiliza. Cliente que escreve às 2h com a loja abrindo às 18h já está fora da janela quando o lojista for retomar — a promessa seria impossível de cumprir sem template aprovado. Quando `retomada_atendimento` for aprovado, isso vira uma evolução natural.

Descartada também a resposta pronta sem IA (custo zero): repetir a mesma frase a cada mensagem é robótico, e restaurante fechado recebe poucas mensagens — não é onde o custo vaza.

### 5. Mídia: a IA lê para classificar, nunca para decidir sobre dinheiro

A IA **recebe a imagem** e a interpreta. O comportamento se divide:

- **Comprovante ou pagamento:** não comenta o conteúdo, chama o lojista.
- **Qualquer outra coisa** (foto de prato, pedido errado, dúvida): responde normalmente.

Descartado deixar a IA confirmar pagamento: print se falsifica em trinta segundos, e o custo de errar é dinheiro do lojista. Separar **ler para entender** de **decidir sobre dinheiro** mantém o humano no meio da decisão financeira sem perder os casos que valem — foto de prato e reclamação de pedido errado.

Descartado também ignorar a mídia: a IA responderia como se o cliente não tivesse dito nada.

### 6. Localização vira tipo de primeira classe

O cliente manda a localização do WhatsApp e ela chega à IA como coordenadas, utilizáveis para o endereço de entrega. Na caixa de entrada aparece de forma reconhecível, com link para o mapa.

É o jeito mais comum de informar endereço em delivery, e elimina o erro de digitação — que hoje é onde mais se perde entrega.

### 7. Complementos entram no texto do cardápio

`montarTextoDoCardapio` passa a incluir os complementos de cada produto, com preço, no mesmo formato que já usa para os itens. As tabelas já existem; falta só chegarem ao prompt.

Mesma regra vale: a IA só oferece complemento cadastrado, com o preço cadastrado.

### 8. Custo de imagem: 3 créditos

Texto custa 1, áudio custa 8. Visão custa mais que texto e menos que transcrição de áudio — 3 mantém a escala coerente e é defensável comercialmente.

## Mudanças no banco

Uma migration, só colunas em `restaurantes`:

| Coluna | Tipo | Papel |
|---|---|---|
| `horario_funcionamento` | JSONB | Sete dias, cada um com lista de faixas `[{abre, fecha}]`. Vazia = fechado. |
| `fuso_horario` | TEXT, padrão `America/Sao_Paulo` | Sem isso "está aberto agora?" é indefinido — o servidor roda em Oregon. |
| `pedido_minimo` | NUMERIC, opcional | Entra em conta, logo é campo. |
| `informacoes_adicionais` | TEXT | Prazo, bairros, formas de pagamento, política. |

JSONB em vez de sete pares de colunas porque a estrutura é irregular por natureza: um dia pode ter zero, uma ou duas faixas.

`taxa_entrega_padrao` **não precisa de migration** — só de ser usada.

## Arquitetura

### Backend

**Função pura de horário.** Recebe o JSON de horários, o fuso e o instante atual; devolve se está aberto e, quando fechado, o próximo horário de abertura. Sem banco, sem rede — mesmo formato do `janela.ts` das 24 horas, testável isoladamente.

**Avaliada no webhook, antes do consumo de créditos**, no mesmo ponto onde `decidirAtendimento` já barra conversa sob controle humano. Isso decide quem paga a conta de uma mensagem de madrugada.

**Prompt em `openai-agent.ts`** ganha: estado de abertura e próximo horário, taxa de entrega, pedido mínimo, informações adicionais, a regra anti-invenção alargada, a regra de nunca confirmar pagamento, e a regra de não anotar pedido enquanto fechado.

**Webhook** passa a tratar imagem, documento e localização como tipos de primeira classe. Imagem e documento são baixados da Meta e guardados no bucket privado (que já funciona), gravados com o tipo correto. Localização não tem arquivo: guarda as coordenadas e o endereço, quando a Meta o envia. Vídeo e figurinha continuam não suportados, mas ganham rótulo honesto em vez de linha vazia.

**CRM (`reactivation.ts`)** troca o cliente anon pelo `supabaseAdmin`, verifica o `error` em toda consulta, e a campanha de reativação passa a enviar template. `ifood-api.ts` recebe a mesma correção de cliente e de tratamento de erro.

### Frontend

Duas seções novas em **Configurações**, abaixo da conexão do WhatsApp:

- **Horário de funcionamento** — sete linhas com interruptor de aberto/fechado e os pares de horário. Botão **"copiar para todos os dias"**, porque a maioria repete de segunda a sexta.
- **Informações da loja** — taxa de entrega, pedido mínimo, e o campo livre com texto de ajuda sobre o que faz sentido colocar ali.

**Caixa de entrada** passa a exibir imagem (miniatura) e documento (rótulo com nome do arquivo), abrindo por URL assinada — mesmo mecanismo do áudio.

## Testes

- **CRM:** uma mensagem recebida cria a linha em `clientes_crm` — o teste que teria pegado o defeito no dia zero. Erro do Supabase propaga em vez de ser engolido.
- **Função de horário:** aberto dentro da faixa, fechado fora, dia sem faixas, intervalo de almoço, virada de meia-noite, fuso correto, próximo horário de abertura calculado certo.
- **Decisão de resposta quando fechado:** não anota pedido, informa o horário.
- **Mídia:** imagem, documento e localização gravados com tipo correto; tipo não suportado gera rótulo honesto em vez de linha vazia; Meta mockada, sem rede.
- **Cardápio:** complementos aparecem no texto com preço; complemento indisponível é omitido, como já acontece com produto.
- **Custo:** imagem debita 3 créditos.

## Fora de escopo

Pedido agendado, IA confirmando pagamento, envio de mídia pelo painel, resposta em áudio, suporte a vídeo e figurinha, taxa de entrega por bairro, e cupons como sistema próprio. Cada um tem seu próprio ciclo.

**Nada aqui é descartado por "não estar no contrato".** O contrato define o mínimo, não o teto — estes itens estão fora deste ciclo por custo e sequência, e vivem no backlog priorizado do `progress.md`.
