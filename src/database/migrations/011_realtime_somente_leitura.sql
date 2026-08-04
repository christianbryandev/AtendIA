-- ============================================================
-- 011_realtime_somente_leitura.sql
-- Corrige achado de revisão de segurança da Task 8.
--
-- CONTEXTO DA VULNERABILIDADE CORRIGIDA AQUI:
-- As policies `conversas_isolation_policy` e `mensagens_isolation_policy`
-- (migration 009) são `FOR ALL` com apenas USING, sem WITH CHECK
-- explícito. Em Postgres, uma policy FOR ALL sem WITH CHECK herda a
-- expressão do USING também para o WITH CHECK — ou seja, o mesmo JWT
-- que o navegador usa para LER libera INSERT e UPDATE também.
--
-- Isso contradiz a promessa de "só leitura" documentada em
-- frontend/src/services/supabase.ts: todo envio deveria passar pela
-- nossa API, para nenhuma mensagem escapar das checagens de janela,
-- crédito e token.
--
-- Cenário concreto de abuso: pelo console do navegador, um lojista
-- autenticado poderia fazer
--   supabase.from('conversas').update({ ultima_mensagem_cliente_em: NOW() })
-- direto no próprio restaurante. O nosso servidor calcularia a janela
-- de 24h da Meta como aberta quando na verdade não está, o envio sairia
-- da nossa API e a Meta recusaria a mensagem — violações repetidas de
-- janela são risco para a conta do WhatsApp Business.
--
-- CORREÇÃO: substitui as duas policies FOR ALL por policies FOR SELECT
-- (mesma expressão de tenant da 009, sem alterações), deixando a escrita
-- exclusiva para a service_role — ou seja, só pela nossa API.
--
-- Sobre a service_role: o Supabase configura a role `service_role` com
-- BYPASSRLS no Postgres, então ela nunca é avaliada contra policy
-- nenhuma, e passaria mesmo se não houvesse policy de escrita para ela.
-- A cláusula "OR current_setting('role') = 'service_role'" mantida
-- abaixo (idêntica à da 009) é redundância defensiva para o caso de a
-- API rodar sob um papel que tenha RLS habilitada mas não BYPASSRLS
-- (ex.: proxies ou conexões que não usam a connection string de
-- service_role diretamente) — nesse caso a policy de SELECT ainda
-- libera a leitura para esse papel. De qualquer forma, com a policy
-- virando FOR SELECT, nenhum papel comum consegue mais INSERT/UPDATE:
-- não existe mais WITH CHECK nenhum liberando escrita fora da
-- BYPASSRLS da service_role real.
--
-- Não inventamos uma expressão de tenant nova: é a mesma da 009,
-- copiada, para não trocar um bug de isolamento por outro.
-- ============================================================

DROP POLICY IF EXISTS conversas_isolation_policy ON conversas;
DROP POLICY IF EXISTS conversas_leitura_policy ON conversas;
CREATE POLICY conversas_leitura_policy ON conversas
    FOR SELECT
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

DROP POLICY IF EXISTS mensagens_isolation_policy ON mensagens;
DROP POLICY IF EXISTS mensagens_leitura_policy ON mensagens;
CREATE POLICY mensagens_leitura_policy ON mensagens
    FOR SELECT
    USING (
        restaurante_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
        OR current_setting('role') = 'service_role'
    );

-- ============================================================
-- COMO VALIDAR ESTA MIGRATION NO SQL EDITOR DO SUPABASE
-- ============================================================
-- Depois de aplicar, rode a suíte src/database/isolamento-realtime.test.ts:
-- os testes que tentam INSERT/UPDATE como restaurante A devem passar a
-- FALHAR com erro de RLS (isso é o esperado — antes da 011 esses
-- mesmos testes provam a vulnerabilidade, falhando com "sucesso"
-- indevido na escrita).
-- ============================================================
