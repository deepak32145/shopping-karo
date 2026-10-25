package com.shoppingkaro.order;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Tests sign in with a token written as "userId.ROLE+ROLE", for example "alice.BUYER" or "admin.ADMIN+BUYER"
 * (only characters a bearer token may contain). It stands in for the real decoder, so the real filter chain,
 * role mapping and URL rules all still run.
 */
@TestConfiguration
public class TestJwtConfig {
  @Bean
  JwtDecoder testJwtDecoder() {
    return token -> {
      String[] parts = token.split("\\.", 2);
      if (parts.length != 2 || parts[0].isBlank()) throw new BadJwtException("not a test token");
      List<String> roles = Arrays.stream(parts[1].split("\\+")).filter(r -> !r.isBlank()).toList();
      return Jwt.withTokenValue(token).header("alg", "none").subject(parts[0]).claim("email", parts[0] + "@example.com")
          .claim("roles", roles).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();
    };
  }
}
