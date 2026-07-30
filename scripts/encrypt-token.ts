import { encrypt } from '../src/utils/crypto.js';

// Pega o token puro a partir do argumento do terminal:
// npm run encrypt-token "EAAG..."
const rawToken = process.argv[2];

if (!rawToken) {
  console.error('\n❌ Erro: Forneça o token que deseja criptografar como argumento.');
  console.error('Uso correto: npm run encrypt-token "SEU_TOKEN_AQUI"\n');
  process.exit(1);
}

try {
  const hash = encrypt(rawToken);
  console.log('\n✅ Token criptografado com sucesso (AES-256-CBC)!\n');
  console.log('👇 Copie o valor abaixo e cole na coluna `meta_access_token` no banco de dados:\n');
  console.log(hash);
  console.log('\n======================================================\n');
} catch (err: any) {
  console.error('\n❌ Erro ao criptografar:', err.message);
  console.error('Verifique se a sua variável de ambiente ENCRYPTION_KEY está correta.\n');
}
