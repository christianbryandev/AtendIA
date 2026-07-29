# Plataforma de Delivery, PDV & CRM com IA no WhatsApp

Este repositório contém o código-fonte completo do sistema SaaS de Gestão de Delivery, Frente de Caixa (PDV), CRM e Atendimento Automático por IA no WhatsApp.

## Cláusulas do Contrato Mapeadas no Código

| Cláusula do Contrato | Módulo / Arquivo no Código | Descrição da Implementação |
| :--- | :--- | :--- |
| **1. Implantação do CRM** | `src/database/schema.sql`<br>`src/services/crm/reactivation.ts` | Estrutura de banco relacional PostgreSQL (Supabase) com tabela `clientes_crm` e LTV acumulado. |
| **2. Configuração das automações** | `src/server.ts` | Webhooks automáticos da WhatsApp Cloud API conectados a eventos em tempo real. |
| **3. Organização da base de contatos** | `src/services/crm/reactivation.ts` (`upsertCustomerInCRM`) | Captura automática de contatos com higienização de telefone, tags (`cliente_novo`, `vip`, `em_reativacao`) e histórico. |
| **4. Fluxos automáticos de atendimento** | `src/services/ai/openai-agent.ts` | Fluxo de atendimento humanizado 100% conversacional (boas-vindas, envio de cardápio, cálculo de taxa de entrega e troco). |
| **5. Campanhas de reativação de clientes** | `src/services/crm/reactivation.ts` (`runReactivationCampaign`) | Automação de disparos de cupons (ex: `VOLTEI10`) para clientes que não compram há mais de 15 ou 30 dias. |
| **6. Estratégias de fidelização** | `src/services/crm/reactivation.ts` (`addLoyaltyPoints`) | Acúmulo automático de pontos de fidelidade a cada pedido concluído. |
| **7. Implementação de IA para apoio ao atendimento** | `src/services/ai/groq-stt.ts`<br>`src/services/ai/openai-agent.ts`<br>`src/services/ai/openai-tts.ts` | Tríade de IA: Transcrição de áudio com Groq Whisper STT, Cérebro LLM GPT-4o-mini e Voz humanizada OpenAI TTS. |

## Como Rodar o Projeto

1. Instalar as dependências:
   ```bash
   npm install
   ```
2. Configurar o arquivo `.env` com suas chaves de API (`SUPABASE_URL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `META_WHATSAPP_TOKEN`).
3. Executar em modo de desenvolvimento:
   ```bash
   npm run dev
   ```
