import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-cbc';

/**
 * Criptografa um texto usando AES-256-CBC e a chave secreta do ambiente.
 * @param text O texto puro a ser criptografado.
 * @returns Uma string no formato "ivEmHex:textoCifradoEmHex".
 */
export function encrypt(text: string): string {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY não configurada no ambiente.');
  }
  
  // A chave de ambiente deve ter exatos 64 caracteres hexadecimais (32 bytes)
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hexadecimais).');
  }

  // Gera um IV único e aleatório para esta criptografia
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decifra um texto que foi criptografado pela função `encrypt`.
 * @param hash A string criptografada no formato "ivEmHex:textoCifradoEmHex".
 * @returns O texto puro original.
 */
export function decrypt(hash: string): string {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY não configurada no ambiente.');
  }

  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY deve ter exatamente 32 bytes (64 caracteres hexadecimais).');
  }

  const parts = hash.split(':');
  if (parts.length !== 2) {
    throw new Error('O formato do hash criptografado é inválido. Esperado "iv:textoCifrado".');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
