-- ============================================================
-- SCHEMA COMPLETO DO BANCO DE DADOS POSTGRESQL / SUPABASE
-- PLATAFORMA DE DELIVERY, PDV, CRM E ATENDIMENTO POR IA
-- ============================================================

-- ============================================================
-- ⚠️ ATENÇÃO: ISOLAMENTO MANUAL NO FLUXO DE WEBHOOK (SERVICE ROLE) ⚠️
-- Qualquer query feita utilizando a Service Role (ex: no recebimento do 
-- Webhook do WhatsApp) faz bypass automático no RLS. O banco de dados 
-- não protege esse caminho. Você DEVE obrigatoriamente incluir 
-- `WHERE restaurante_id = $1` manualmente em todas as queries executadas 
-- com o cliente admin/service_role.
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE RESTAURANTES (TENANTS / LOJAS)
CREATE TABLE IF NOT EXISTS restaurantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    email_acesso VARCHAR(255) UNIQUE,
    senha_acesso VARCHAR(255) CHECK (senha_acesso LIKE '$2b$%'), -- Garante que seja um hash bcrypt
    meta_phone_number_id VARCHAR(100),
    meta_access_token TEXT,
    tom_voz_ia VARCHAR(100) DEFAULT 'Amigável, descontraído e eficiente',
    instrucoes_personalizadas TEXT,
    taxa_entrega_padrao NUMERIC(10,2) DEFAULT 5.00,
    tempo_medio_preparo INT DEFAULT 30, -- minutos
    ativo BOOLEAN DEFAULT TRUE,
    gateway_recebimento_id VARCHAR(100),
    gateway_access_token TEXT,
    ifood_merchant_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comentários obrigatórios de documentação para a tabela restaurantes
COMMENT ON COLUMN restaurantes.senha_acesso IS 'Toda senha DEVE ser hasheada com bcrypt antes do insert. Não é permitido salvar ou comparar senha em texto puro.';
COMMENT ON COLUMN restaurantes.meta_access_token IS 'Este campo deve ser gravado sempre já criptografado com AES-256-CBC pela aplicação, seguindo o mesmo padrão usado em gateway_access_token. Não gravar em texto puro.';

-- 2. TABELA DE CRM E BASE DE CONTATOS DE CLIENTES
CREATE TABLE IF NOT EXISTS clientes_crm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    telefone_whatsapp VARCHAR(30) NOT NULL,
    nome VARCHAR(255),
    total_pedidos INT DEFAULT 0,
    valor_total_gasto NUMERIC(10,2) DEFAULT 0.00, -- LTV
    ultimo_pedido_at TIMESTAMP WITH TIME ZONE,
    ultimo_pedido_json JSONB, -- Para repetição rápida de pedido em 1 clique
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurante_id, telefone_whatsapp)
);

-- 3. TABELA DE CATEGORIAS DO CARDÁPIO
CREATE TABLE IF NOT EXISTS categorias_cardapio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    ordem_exibicao INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.1 TABELA DE PRODUTOS / CARDÁPIO DIGITAL
CREATE TABLE IF NOT EXISTS produtos_cardapio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES categorias_cardapio(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL,
    imagem_url TEXT,
    adicionais_json JSONB DEFAULT '[]'::jsonb, -- Manter temporariamente para compatibilidade
    disponivel BOOLEAN DEFAULT TRUE,
    ordem_exibicao INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.2 TABELA DE COMPLEMENTOS (EXTRA)
CREATE TABLE IF NOT EXISTS complementos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    preco NUMERIC(10,2) DEFAULT 0.00,
    obrigatorio BOOLEAN DEFAULT FALSE,
    max_selecao INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.3 TABELA DE RELAÇÃO PRODUTO <-> COMPLEMENTO
CREATE TABLE IF NOT EXISTS produto_complementos (
    produto_id UUID REFERENCES produtos_cardapio(id) ON DELETE CASCADE,
    complemento_id UUID REFERENCES complementos(id) ON DELETE CASCADE,
    PRIMARY KEY (produto_id, complemento_id)
);

-- 4. TABELA DE PEDIDOS (PDV & ATENDIMENTO IA)
CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes_crm(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'NOVO', -- 'NOVO', 'EM_PREPARO', 'SAIU_ENTREGA', 'CONCLUIDO', 'CANCELADO'
    valor_subtotal NUMERIC(10,2) NOT NULL,
    valor_taxa_entrega NUMERIC(10,2) DEFAULT 0.00,
    valor_desconto NUMERIC(10,2) DEFAULT 0.00,
    valor_total NUMERIC(10,2) NOT NULL,
    endereco_entrega TEXT,
    observacoes TEXT,
    forma_pagamento VARCHAR(50) NOT NULL, -- 'PIX_ONLINE', 'DINHEIRO', 'CARTAO_ENTREGA'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4.1 TABELA DE ITENS DO PEDIDO
CREATE TABLE IF NOT EXISTS itens_pedido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES produtos_cardapio(id) ON DELETE SET NULL, -- NULLABLE (Permite itens do iFood sem cadastro nativo)
    nome_item_snapshot VARCHAR(255) NOT NULL CHECK (TRIM(nome_item_snapshot) <> ''), -- Snapshot obrigatório
    quantidade INT DEFAULT 1,
    preco_unitario NUMERIC(10,2) NOT NULL, -- Snapshot do preço sempre preenchido
    anotacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABELA DE CAMPANHAS DE REATIVAÇÃO DE CLIENTES (CRM AUTOMÁTICO)
CREATE TABLE IF NOT EXISTS campanhas_reativacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    nome_campanha VARCHAR(255) NOT NULL,
    dias_sem_comprar INT NOT NULL, -- ex: 15 ou 30 dias
    mensagem_template TEXT NOT NULL,
    cupom_desconto VARCHAR(50),
    total_disparados INT DEFAULT 0,
    total_convertidos INT DEFAULT 0,
    ativa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABELA DE CAIXAS (FRENTE DE LOJA)
CREATE TABLE IF NOT EXISTS caixas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    aberto_por VARCHAR(255),
    valor_abertura NUMERIC(10,2) NOT NULL,
    valor_fechamento NUMERIC(10,2),
    status VARCHAR(20) DEFAULT 'ABERTO', -- 'ABERTO', 'FECHADO'
    aberto_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fechado_em TIMESTAMP WITH TIME ZONE,
    observacoes TEXT
);

-- 7. TABELA DE ASSINATURAS (SAAS)
-- ⚠️ OBSOLETA: esta definição não é a usada pelo sistema de cobrança.
-- A forma correta (com stripe_customer_id, stripe_subscription_id,
-- periodo_fim, UNIQUE em restaurante_id e CHECK de status) está na
-- migration 006_assinaturas_creditos.sql. Mantida aqui como retrato
-- histórico; não aplicar este bloco em banco novo.
CREATE TABLE IF NOT EXISTS assinaturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
    plano VARCHAR(20), -- 'MENSAL', 'ANUAL'
    status VARCHAR(20), -- 'ATIVA', 'INADIMPLENTE', 'CANCELADA'
    proxima_cobranca DATE,
    gateway_subscription_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ÍNDICES PARA ALTA PERFORMANCE NAS CONSULTAS
CREATE INDEX IF NOT EXISTS idx_clientes_crm_tel ON clientes_crm(restaurante_id, telefone_whatsapp);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(restaurante_id, status);
CREATE INDEX IF NOT EXISTS idx_produtos_cat ON produtos_cardapio(restaurante_id, categoria_id);

-- ============================================================
-- TRIGGERS DE ATUALIZAÇÃO DE MODTIME (UPDATED_AT)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_restaurantes_modtime
    BEFORE UPDATE ON restaurantes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pedidos_modtime
    BEFORE UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ISOLAMENTO REAL NO BANCO DE DADOS POSTGRESQL (SUPABASE)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_cardapio ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos_cardapio ENABLE ROW LEVEL SECURITY;
ALTER TABLE complementos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_complementos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_reativacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

-- 1. Política de isolamento para Restaurantes
CREATE POLICY restaurantes_isolation_policy ON restaurantes
    FOR ALL
    USING (
        id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 2. Política de isolamento para Clientes CRM
CREATE POLICY crm_isolation_policy ON clientes_crm
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 3. Política de isolamento para Produtos/Cardápio
CREATE POLICY produtos_isolation_policy ON produtos_cardapio
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 4. Política de isolamento para Pedidos
CREATE POLICY pedidos_isolation_policy ON pedidos
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 4.1 Política de isolamento para Itens do Pedido (Transitiva)
CREATE POLICY itens_pedido_isolation_policy ON itens_pedido
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.id = itens_pedido.pedido_id
            AND p.restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        )
        OR current_setting('role') = 'service_role'
    );

-- 5. Política de isolamento para Categorias
CREATE POLICY categorias_isolation_policy ON categorias_cardapio
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 6. Política de isolamento para Complementos
CREATE POLICY complementos_isolation_policy ON complementos
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 7. Política de isolamento para Produto_Complementos (Subquery)
CREATE POLICY produto_complementos_isolation_policy ON produto_complementos 
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM produtos_cardapio pc
            WHERE pc.id = produto_complementos.produto_id
            AND pc.restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        )
        OR current_setting('role') = 'service_role'
    );

-- 8. Política de isolamento para Campanhas de Reativação
CREATE POLICY campanhas_isolation_policy ON campanhas_reativacao
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 9. Política de isolamento para Caixas
CREATE POLICY caixas_isolation_policy ON caixas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- 10. Política de isolamento para Assinaturas
CREATE POLICY assinaturas_isolation_policy ON assinaturas
    FOR ALL
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- ============================================================
-- TESTE MANUAL DO RLS NO SQL EDITOR
-- Para simular o acesso autenticado de um restaurante, execute as linhas abaixo
-- na aba do SQL Editor do Supabase:
--
-- SELECT set_config('role', 'authenticated', true);
-- SELECT set_config('request.jwt.claims', '{"sub": "COLOQUE_O_UUID_AQUI", "role": "authenticated"}', true);
-- 
-- SELECT * FROM restaurantes; -- Deve retornar apenas a linha correspondente ao UUID inserido.
-- ============================================================
