-- 001_create_usuarios.sql

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger para updated_at
CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS para tabela usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver o próprio perfil"
ON usuarios
FOR SELECT
TO authenticated
USING (
  restaurante_id = (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'restaurante_id')::uuid
);

CREATE POLICY "Usuários podem atualizar o próprio perfil"
ON usuarios
FOR UPDATE
TO authenticated
USING (
  restaurante_id = (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'restaurante_id')::uuid
)
WITH CHECK (
  restaurante_id = (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'restaurante_id')::uuid
);
