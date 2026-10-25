package com.shoppingkaro.auth.token;

import com.nimbusds.jose.jwk.RSAKey;
import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.auth.user.UserDocument;
import com.shoppingkaro.contracts.Role;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
  private static final SecureRandom RANDOM = new SecureRandom();

  private final JwtEncoder encoder;
  private final RefreshTokenRepository refreshTokens;
  private final AuthProperties.Jwt cfg;
  private final String keyId;
  private final MongoTemplate mongo;

  public TokenService(JwtEncoder encoder, RSAKey signingKey, RefreshTokenRepository refreshTokens, MongoTemplate mongo, AuthProperties props) {
    this.mongo = mongo;
    this.encoder = encoder;
    this.keyId = signingKey.getKeyID();
    this.refreshTokens = refreshTokens;
    this.cfg = props.jwt();
  }

  public record IssuedTokens(String accessToken, String refreshToken, long expiresInSeconds) {}

  public IssuedTokens issue(UserDocument user) {
    Instant now = Instant.now();
    Duration accessTtl = Duration.ofMinutes(cfg.accessTtlMinutes());
    JwtClaimsSet claims = JwtClaimsSet.builder()
        .issuer(cfg.issuer())
        .subject(user.getId())
        .issuedAt(now)
        .expiresAt(now.plus(accessTtl))
        .claim("email", user.getEmail())
        .claim("roles", user.getRoles().stream().map(Role::name).toList())
        .build();
    String access = encoder
        .encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId(keyId).build(), claims))
        .getTokenValue();

    byte[] raw = new byte[32];
    RANDOM.nextBytes(raw);
    String refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    refreshTokens.save(new RefreshTokenDocument(hash(refresh), user.getId(), now.plus(Duration.ofDays(cfg.refreshTtlDays()))));

    return new IssuedTokens(access, refresh, accessTtl.toSeconds());
  }

  /** Redeems a refresh token exactly once; returns the owning user id, or empty if unknown/expired. */
  public Optional<String> redeem(String refreshToken) {
    // findAndRemove is a single atomic Mongo operation: two concurrent redemptions cannot both succeed.
    RefreshTokenDocument doc = mongo.findAndRemove(Query.query(Criteria.where("tokenHash").is(hash(refreshToken))), RefreshTokenDocument.class);
    return Optional.ofNullable(doc)
        .filter(t -> t.getExpiresAt().isAfter(Instant.now()))
        .map(RefreshTokenDocument::getUserId);
  }

  public void revoke(String refreshToken) {
    refreshTokens.deleteByTokenHash(hash(refreshToken));
  }

  /** Revokes every refresh token of a user (used after a password reset). */
  public void revokeAll(String userId) {
    refreshTokens.deleteByUserId(userId);
  }

  public static String hash(String token) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
