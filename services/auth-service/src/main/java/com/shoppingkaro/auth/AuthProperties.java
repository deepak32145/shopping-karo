package com.shoppingkaro.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("auth")
public record AuthProperties(Jwt jwt, Reset reset, Otp otp, Google google, Admin admin) {
  /** Optional admin account created (or promoted) at startup. Leave email blank to disable. */
  public record Admin(String email, String password) {}

  /** linkBaseUrl is the web app's address, used to build the emailed reset link. */
  public record Reset(String linkBaseUrl, long ttlMinutes) {}

  public record Otp(long ttlMinutes, int maxAttempts, long resendCooldownSeconds) {}

  public record Google(String clientId) {}

  public record Jwt(String issuer, long accessTtlMinutes, long refreshTtlDays, String privateKeyPem, String publicKeyPem) {}
}
