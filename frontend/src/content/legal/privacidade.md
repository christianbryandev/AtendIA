# Política de Privacidade — AtendIA

**Última atualização:** 1º de agosto de 2026
**Versão:** 1.0

---

## 1. Quem somos

O AtendIA é operado por **67.146.802 CHRISTIAN BRYAN PEREIRA**, inscrito no CNPJ
sob o nº **67.146.802/0001-85**, com sede em Ribeirão Preto, São Paulo.

Nesta política, "nós", "AtendIA" ou "a plataforma" se referem a essa empresa.

**Encarregado pelo Tratamento de Dados Pessoais (LGPD, Art. 41):**
Christian Bryan Pereira — christianpereira.mtx@gmail.com

## 2. O que esta política cobre

O AtendIA é uma plataforma que restaurantes usam para atender seus clientes
automaticamente pelo WhatsApp, gerenciar pedidos e administrar sua base de
contatos.

Isso cria **duas relações diferentes**, e é importante entender qual se aplica a
você:

| Se você é… | Nosso papel | O que significa |
|---|---|---|
| **Um restaurante** que assina o AtendIA | **Controlador** | Decidimos como tratar seus dados cadastrais. Esta política se aplica integralmente a você. |
| **Um cliente de um restaurante** que usa o AtendIA | **Operador** | Tratamos seus dados **em nome do restaurante**, seguindo as instruções dele. O restaurante é o controlador. |

Se você é cliente final e quer exercer seus direitos, pode falar conosco pelo
e-mail acima — vamos encaminhar ao restaurante responsável e apoiar no
atendimento do seu pedido.

---

## 3. Dados que tratamos

### 3.1 Dados do restaurante assinante

| Dado | Para quê | Base legal (LGPD Art. 7º) |
|---|---|---|
| Nome do estabelecimento, e-mail, senha | Criar e proteger sua conta | Execução de contrato (inc. V) |
| Nome dos usuários do painel | Identificar quem acessa | Execução de contrato |
| Credenciais de integração (WhatsApp, iFood, gateway) | Conectar seus canais | Execução de contrato |
| Dados de faturamento e pagamento | Cobrar a assinatura, emitir nota | Obrigação legal (inc. II) |
| Configurações operacionais (taxa de entrega, tempo de preparo, tom de voz da IA) | Fazer o produto funcionar como você configurou | Execução de contrato |

**Senhas** são armazenadas apenas como hash **bcrypt** — não temos como
recuperá-las nem visualizá-las.

**Credenciais de integração** são armazenadas cifradas com **AES-256-CBC**.

### 3.2 Dados dos clientes finais do restaurante

Quando alguém conversa com o WhatsApp de um restaurante que usa o AtendIA,
tratamos, **em nome daquele restaurante**:

- Número de telefone do WhatsApp e nome de exibição
- Conteúdo das mensagens trocadas, **incluindo mensagens de áudio**
- Endereço de entrega informado
- Histórico de pedidos, valores, formas de pagamento e observações
- Métricas derivadas: total de pedidos, valor total gasto, data do último pedido,
  estágio no funil de relacionamento e pontos de fidelidade

**Sobre as mensagens de áudio:** áudios enviados pelo cliente são transcritos
automaticamente para que a inteligência artificial possa entendê-los. A
transcrição é necessária para o funcionamento do serviço.

### 3.3 Dados de navegação no site

No site institucional coletamos apenas o mínimo necessário para que ele
funcione. **Não utilizamos cookies de publicidade nem rastreamento de terceiros
para fins de marketing.**

---

## 4. Com quem compartilhamos

Para funcionar, o AtendIA envia dados a fornecedores especializados. **Todos
estão localizados fora do Brasil**, o que caracteriza transferência internacional
de dados pessoais (LGPD, Art. 33).

| Fornecedor | O que recebe | Para quê | País |
|---|---|---|---|
| **Meta Platforms** (WhatsApp Cloud API) | Mensagens, número de telefone | Enviar e receber mensagens no WhatsApp | EUA |
| **OpenAI** | Texto das conversas, cardápio, contexto do pedido | Gerar as respostas da IA e sintetizar voz | EUA |
| **Groq** | Arquivos de áudio enviados pelos clientes | Transcrever áudio em texto | EUA |
| **Supabase** | Todos os dados armazenados | Hospedar o banco de dados | EUA |
| **Vercel / Render** | Tráfego da aplicação | Hospedar site e servidor | EUA |

Conforme as políticas vigentes desses fornecedores para uso via API, os dados
enviados **não são utilizados para treinar seus modelos de inteligência
artificial**. Recomendamos consultar as políticas de cada um, que podem mudar.

**Não vendemos dados pessoais.** Não compartilhamos com terceiros para fins
publicitários.

Podemos compartilhar dados quando houver **obrigação legal** ou **ordem
judicial**.

---

## 5. Por quanto tempo guardamos

| Situação | Prazo |
|---|---|
| Conta ativa | Enquanto durar a assinatura |
| Após o cancelamento | **90 dias**, para permitir retomada ou exportação |
| Após os 90 dias | Exclusão definitiva dos dados operacionais |
| Dados fiscais e de faturamento | **5 anos**, por obrigação legal, mantidos separadamente |

Você pode pedir a exclusão antes dos 90 dias. Veja a página
[Exclusão de Dados](/exclusao-de-dados).

---

## 6. Seus direitos (LGPD, Art. 18)

Você pode, a qualquer momento:

- **Confirmar** se tratamos dados seus e **acessar** esses dados
- **Corrigir** dados incompletos, inexatos ou desatualizados
- Pedir **anonimização, bloqueio ou eliminação** de dados desnecessários ou
  tratados em desconformidade com a lei
- Solicitar a **portabilidade** dos dados a outro fornecedor
- Obter informação sobre com quem **compartilhamos** seus dados
- **Revogar consentimento**, quando o tratamento se basear nele
- **Opor-se** a tratamento feito com base em legítimo interesse

**Como exercer:** escreva para christianpereira.mtx@gmail.com. Respondemos em até
**15 dias**.

Se você for cliente de um restaurante, encaminharemos seu pedido ao restaurante
responsável e apoiaremos o atendimento.

Você também pode reclamar à **ANPD** (Autoridade Nacional de Proteção de Dados).

---

## 7. Como protegemos

Medidas de segurança efetivamente implementadas na plataforma:

- **Isolamento por cliente** no banco de dados (Row Level Security), de modo que
  um restaurante não consegue acessar dados de outro
- **Senhas** armazenadas como hash bcrypt, nunca em texto legível
- **Credenciais de integração** cifradas com AES-256-CBC
- **Verificação criptográfica** (HMAC SHA-256) de toda mensagem recebida do
  WhatsApp, impedindo mensagens forjadas
- **Sessões autenticadas** com token de validade limitada
- **Comunicação cifrada** (HTTPS/TLS) em todo o tráfego

Nenhum sistema é totalmente imune. Em caso de incidente de segurança relevante,
comunicaremos os titulares afetados e a ANPD, conforme o Art. 48 da LGPD.

---

## 8. Obrigações do restaurante assinante

Se você é um restaurante que usa o AtendIA, você é o **controlador** dos dados
dos seus clientes. Isso significa que **é sua responsabilidade**:

- Informar seus clientes de que o atendimento do seu WhatsApp é feito com apoio
  de inteligência artificial
- Ter base legal adequada para tratar os dados que coleta
- Atender pedidos dos seus clientes sobre os dados deles
- Usar as campanhas de reativação em conformidade com a lei e com as políticas
  do WhatsApp, sem envio de mensagens não solicitadas em massa

Nós tratamos esses dados **apenas conforme suas instruções** e para prestar o
serviço contratado.

---

## 9. Crianças e adolescentes

O AtendIA não se destina a menores de 18 anos. Não coletamos intencionalmente
dados de crianças. Se identificarmos esse tratamento, excluiremos os dados.

---

## 10. Mudanças nesta política

Podemos atualizar esta política. Mudanças relevantes serão comunicadas por
e-mail e avisadas no painel com pelo menos **30 dias** de antecedência. A data no
topo indica a última revisão.

---

## 11. Contato

**67.146.802 CHRISTIAN BRYAN PEREIRA**
CNPJ 67.146.802/0001-85 — Ribeirão Preto/SP
christianpereira.mtx@gmail.com
