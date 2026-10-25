package com.shoppingkaro.auth.otp;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** At most one active code per user. Only a hash of the code is stored. */
@Document("email_otps")
public class EmailOtpDocument {
  @Id
  private String id;

  @Indexed(unique = true)
  private String userId;

  private String codeHash;
  private int attempts;
  private Instant lastSentAt;

  @Indexed(expireAfterSeconds = 0)
  private Instant expiresAt;

  protected EmailOtpDocument() {}

  public EmailOtpDocument(String userId, String codeHash, Instant lastSentAt, Instant expiresAt) {
    this.userId = userId;
    this.codeHash = codeHash;
    this.lastSentAt = lastSentAt;
    this.expiresAt = expiresAt;
  }

  public String getUserId() {
    return userId;
  }

  public String getCodeHash() {
    return codeHash;
  }

  public int getAttempts() {
    return attempts;
  }

  public void recordFailedAttempt() {
    attempts++;
  }

  public Instant getLastSentAt() {
    return lastSentAt;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }
}
