package com.shoppingkaro.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param jwksUri     where auth-service publishes its public keys, e.g. http://localhost:8081/.well-known/jwks.json
 * @param issuer      the "iss" claim access tokens must carry
 * @param publicPaths extra paths reachable without a token (the health check is always public)
 */
@ConfigurationProperties("sk.security")
public record SecurityProperties(String jwksUri, String issuer, List<String> publicPaths) {
  public SecurityProperties {
    publicPaths = publicPaths == null ? List.of() : List.copyOf(publicPaths);
  }
}
