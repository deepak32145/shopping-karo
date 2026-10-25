package com.shoppingkaro.auth.reset;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Only the SHA-256 hash of the emailed token is stored. */
@Document("password_reset_tokens")
public class PasswordResetTokenDocument {
  @Id
  private String id;

  @Indexed(unique = true)
  private String tokenHash;

  private String userId;

  @Indexed(expireAfterSeconds = 0)
  private Instant expiresAt;

  protected PasswordResetTokenDocument() {}

  public PasswordResetTokenDocument(String tokenHash, String userId, Instant expiresAt) {
    this.tokenHash = tokenHash;
    this.userId = userId;
    this.expiresAt = expiresAt;
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
