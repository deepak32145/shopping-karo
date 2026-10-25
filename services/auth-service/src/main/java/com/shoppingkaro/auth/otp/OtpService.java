package com.shoppingkaro.auth.otp;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.auth.token.TokenService;
import com.shoppingkaro.auth.user.UserDocument;
import com.shoppingkaro.common.AppException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Six-digit email codes: 10 minute lifetime, 5 attempts, one resend per minute. */
@Service
public class OtpService {
  private static final SecureRandom RANDOM = new SecureRandom();

  private final EmailOtpRepository otps;
  private final OtpNotifier notifier;
  private final AuthProperties.Otp cfg;

  public OtpService(EmailOtpRepository otps, OtpNotifier notifier, AuthProperties props) {
    this.otps = otps;
    this.notifier = notifier;
    this.cfg = props.otp();
  }

  /**
   * Sends a fresh code unless one was sent within the cooldown (then it is silently skipped, so a resend button
   * cannot be used to flood someone's inbox).
   */
  public void issue(UserDocument user) {
    Instant now = Instant.now();
    var existing = otps.findByUserId(user.getId());
    if (existing.isPresent() && existing.get().getLastSentAt().plusSeconds(cfg.resendCooldownSeconds()).isAfter(now)) {
      return;
    }
    String code = String.format("%06d", RANDOM.nextInt(1_000_000));
    otps.deleteByUserId(user.getId());
    otps.save(new EmailOtpDocument(user.getId(), hash(user.getId(), code), now, now.plus(Duration.ofMinutes(cfg.ttlMinutes()))));
    notifier.send(user.getEmail(), user.getName(), code);
  }

  /** Throws unless the code is correct; a correct code is consumed. */
  public void verify(UserDocument user, String code) {
    EmailOtpDocument doc = otps.findByUserId(user.getId()).filter(d -> d.getExpiresAt().isAfter(Instant.now()))
        .orElseThrow(() -> invalid("This code has expired. Please request a new one."));
    if (doc.getAttempts() >= cfg.maxAttempts()) {
      otps.deleteByUserId(user.getId());
      throw invalid("Too many incorrect attempts. Please request a new code.");
    }
    boolean ok = MessageDigest.isEqual(
        hash(user.getId(), code).getBytes(StandardCharsets.UTF_8), doc.getCodeHash().getBytes(StandardCharsets.UTF_8));
    if (!ok) {
      doc.recordFailedAttempt();
      otps.save(doc);
      int left = Math.max(0, cfg.maxAttempts() - doc.getAttempts());
      throw invalid(left == 0 ? "Too many incorrect attempts. Please request a new code." : "That code is incorrect. " + left + " attempts left.");
    }
    otps.deleteByUserId(user.getId());
  }

  private static String hash(String userId, String code) {
    return TokenService.hash(userId + ":" + code);
  }

  private static AppException invalid(String message) {
    return new AppException(HttpStatus.BAD_REQUEST, "INVALID_OTP", message);
  }
}
