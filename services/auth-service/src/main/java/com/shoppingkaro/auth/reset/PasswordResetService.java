package com.shoppingkaro.auth.reset;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.auth.token.TokenService;
import com.shoppingkaro.auth.user.UserDocument;
import com.shoppingkaro.auth.user.UserRepository;
import com.shoppingkaro.common.AppException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class PasswordResetService {
  private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
  private static final SecureRandom RANDOM = new SecureRandom();

  private final UserRepository users;
  private final PasswordResetTokenRepository resetTokens;
  private final MongoTemplate mongo;
  private final PasswordEncoder encoder;
  private final TokenService tokens;
  private final PasswordResetNotifier notifier;
  private final AuthProperties.Reset cfg;

  public PasswordResetService(
      UserRepository users,
      PasswordResetTokenRepository resetTokens,
      MongoTemplate mongo,
      PasswordEncoder encoder,
      TokenService tokens,
      PasswordResetNotifier notifier,
      AuthProperties props) {
    this.users = users;
    this.resetTokens = resetTokens;
    this.mongo = mongo;
    this.encoder = encoder;
    this.tokens = tokens;
    this.notifier = notifier;
    this.cfg = props.reset();
  }

  /** Always completes silently: the caller must not learn whether the email has an account. */
  public void request(String email) {
    users.findByEmail(email.trim().toLowerCase(Locale.ROOT)).ifPresent(user -> {
      resetTokens.deleteByUserId(user.getId()); // only the newest link works
      byte[] raw = new byte[32];
      RANDOM.nextBytes(raw);
      String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
      resetTokens.save(new PasswordResetTokenDocument(
          TokenService.hash(token), user.getId(), Instant.now().plus(Duration.ofMinutes(cfg.ttlMinutes()))));
      try {
        notifier.send(user.getEmail(), user.getName(), cfg.linkBaseUrl() + "/?reset=" + token);
      } catch (AppException e) {
        // Do not turn an SMTP failure into a different response: that would reveal the account exists.
        log.error("Password reset email to {} failed: {}", user.getEmail(), e.getMessage());
      }
    });
  }

  public void reset(String token, String newPassword) {
    String tokenHash = TokenService.hash(token);
    PasswordResetTokenDocument doc = resetTokens.findByTokenHash(tokenHash)
        .filter(t -> t.getExpiresAt().isAfter(Instant.now()))
        .orElseThrow(PasswordResetService::invalidToken);
    UserDocument user = users.findById(doc.getUserId()).orElseThrow(PasswordResetService::invalidToken);

    // Checked before the token is consumed, so a rejected password does not burn the link.
    for (String old : user.recentPasswordHashes()) {
      if (encoder.matches(newPassword, old)) {
        throw new AppException(
            HttpStatus.BAD_REQUEST, "PASSWORD_REUSED",
            "You can't reuse any of your last " + UserDocument.PASSWORD_HISTORY_SIZE + " passwords. Please choose a new one.");
      }
    }

    // Atomic consume: of two simultaneous requests with the same link, only one gets the document.
    if (mongo.findAndRemove(Query.query(Criteria.where("tokenHash").is(tokenHash)), PasswordResetTokenDocument.class) == null) {
      throw invalidToken();
    }
    user.changePassword(encoder.encode(newPassword));
    user.markEmailVerified(); // the link only ever reached the owner's inbox
    users.save(user);
    tokens.revokeAll(user.getId()); // sign out every device
  }

  private static AppException invalidToken() {
    return new AppException(HttpStatus.BAD_REQUEST, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Please request a new one.");
  }
}
