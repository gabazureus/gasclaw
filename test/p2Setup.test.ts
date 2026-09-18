import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('setup sem chave da P2', () => {
  const cli = readFileSync('gasclaw', 'utf8');

  test('up habilita IAM Credentials e cria/reusa a identidade do Chat', () => {
    expect(cli).toContain('iamcredentials.googleapis.com');
    expect(cli).toContain('gcloud iam service-accounts create');
    expect(cli).toContain('iam.serviceAccounts.getAccessToken');
    expect(cli).toContain('gcloud iam roles update');
    expect(cli).toContain('gcloud iam service-accounts set-iam-policy');
    expect(cli).toMatch(/cmd_up\(\)[\s\S]*ensure_gcp[\s\S]*ensure_chat_identity[\s\S]*ensure_script/);
    expect(cli).toContain('export CHAT_SA_EMAIL=');
  });

  test('setup nunca cria ou baixa chave privada', () => {
    expect(cli).not.toMatch(/service-accounts keys create/);
    expect(cli).not.toMatch(/credentials\.json/);
    expect(readFileSync('appsscript.json', 'utf8')).not.toContain('https://www.googleapis.com/auth/iam');
    const build = readFileSync('build.mjs', 'utf8');
    expect(build).toContain("if (process.env.GASCLAW_DEV === '1') manifest.oauthScopes.push(iamScope)");
  });
});
