package com.shoppingkaro.auth.user;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.contracts.Role;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the platform admin from operator configuration (ADMIN_EMAIL / ADMIN_PASSWORD), so there is no public way
 * to become an admin. Registering the admin address by hand is impossible once it exists.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {
  private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final AuthProperties.Admin cfg;

  public AdminBootstrap(UserRepository users, PasswordEncoder encoder, AuthProperties props) {
    this.users = users;
    this.encoder = encoder;
    this.cfg = props.admin();
  }

  @Override
  public void run(ApplicationArguments args) {
    if (cfg == null || cfg.email() == null || cfg.email().isBlank()) {
      return;
    }
    ensureAdmin(cfg.email(), cfg.password());
  }

  /** Existing account: promoted (password untouched). Missing account: created if a usable password was configured. */
  public void ensureAdmin(String rawEmail, String password) {
    String email = rawEmail.trim().toLowerCase(Locale.ROOT);
    var existing = users.findByEmail(email);
    if (existing.isPresent()) {
      UserDocument user = existing.get();
      user.grantAdmin();
      users.save(user);
      log.info("Admin role ensured for existing account {}", email);
      return;
    }
    if (password == null || password.length() < 8) {
      log.warn("ADMIN_EMAIL {} has no account and ADMIN_PASSWORD is missing or shorter than 8 characters: admin not created.", email);
      return;
    }
    UserDocument admin = new UserDocument(
        UUID.randomUUID().toString(), email, encoder.encode(password), "Admin", Set.of(Role.ADMIN, Role.BUYER), Instant.now());
    admin.markEmailVerified();
    users.save(admin);
    log.info("Created admin account {}", email);
  }
}
