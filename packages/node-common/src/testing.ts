import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';

export interface TestIssuer {
  keys: JWTVerifyGetKey;
  issuer: string;
  /** Signs an access token like auth-service would. */
  sign(subject: string, roles?: string[], opts?: { expiresIn?: string; issuer?: string }): Promise<string>;
}

/** For tests only: a throwaway signing key plus a matching key set, so services can be tested without auth-service. */
export async function createTestIssuer(issuer = 'shopping-karo-auth'): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'test-key' };
  return {
    keys: createLocalJWKSet({ keys: [jwk] }),
    issuer,
    sign: (subject, roles = ['BUYER'], opts = {}) =>
      new SignJWT({ roles, email: `${subject}@example.com` })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject(subject)
        .setIssuer(opts.issuer ?? issuer)
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '15m')
        .sign(privateKey),
  };
}
