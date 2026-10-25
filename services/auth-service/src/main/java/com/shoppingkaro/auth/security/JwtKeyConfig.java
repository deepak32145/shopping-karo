package com.shoppingkaro.auth.security;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.shoppingkaro.auth.AuthProperties;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/** RS256 signing key: loaded from PEM config in real environments, ephemeral in local dev. */
@Configuration
public class JwtKeyConfig {
  private static final Logger log = LoggerFactory.getLogger(JwtKeyConfig.class);

  @Bean
  RSAKey rsaKey(AuthProperties props) throws Exception {
    var jwt = props.jwt();
    RSAPublicKey pub;
    RSAPrivateKey priv;
    if (hasText(jwt.privateKeyPem()) && hasText(jwt.publicKeyPem())) {
      KeyFactory kf = KeyFactory.getInstance("RSA");
      priv = (RSAPrivateKey) kf.generatePrivate(new PKCS8EncodedKeySpec(decodePem(jwt.privateKeyPem())));
      pub = (RSAPublicKey) kf.generatePublic(new X509EncodedKeySpec(decodePem(jwt.publicKeyPem())));
    } else {
      log.warn("No JWT key configured: generating an EPHEMERAL RSA key. Tokens become invalid on restart. Do not use in production.");
      KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
      gen.initialize(2048);
      KeyPair pair = gen.generateKeyPair();
      pub = (RSAPublicKey) pair.getPublic();
      priv = (RSAPrivateKey) pair.getPrivate();
    }
    return new RSAKey.Builder(pub).privateKey(priv).keyIDFromThumbprint().build();
  }

  @Bean
  JwtEncoder jwtEncoder(RSAKey key) {
    return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(key)));
  }

  @Bean
  JwtDecoder jwtDecoder(RSAKey key) throws Exception {
    return NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build();
  }

  private static boolean hasText(String s) {
    return s != null && !s.isBlank();
  }

  private static byte[] decodePem(String pem) {
    String body = pem.replaceAll("-----(BEGIN|END)[A-Z ]+-----", "").replaceAll("\\s", "");
    return Base64.getDecoder().decode(body);
  }
}
