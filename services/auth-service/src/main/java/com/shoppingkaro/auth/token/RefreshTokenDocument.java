package com.shoppingkaro.auth.token;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Only the SHA-256 hash of the refresh token is stored, never the token itself. */
@Document("refresh_tokens")
public class RefreshTokenDocument {
  @Id
  private String id;

  @Indexed(unique = true)
  private String tokenHash;

  private String userId;

  /** Mongo TTL index removes the document once this instant passes. */
  @Indexed(expireAfterSeconds = 0)
  private Instant expiresAt;

  protected RefreshTokenDocument() {}

  public RefreshTokenDocument(String tokenHash, String userId, Instant expiresAt) {
    this.tokenHash = tokenHash;
    this.userId = userId;
    this.expiresAt = expiresAt;
  }

  public String getId() {
    return id;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public String getUserId() {
    return userId;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }
}
