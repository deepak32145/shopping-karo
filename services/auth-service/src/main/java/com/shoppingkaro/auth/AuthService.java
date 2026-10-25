package com.shoppingkaro.auth;

import com.shoppingkaro.auth.google.GoogleIdentityVerifier;
import com.shoppingkaro.auth.otp.OtpService;
import com.shoppingkaro.auth.token.TokenService;
import com.shoppingkaro.auth.user.UserDocument;
import com.shoppingkaro.auth.user.UserRepository;
import com.shoppingkaro.auth.web.Dtos.LoginRequest;
import com.shoppingkaro.auth.web.Dtos.RegisterRequest;
import com.shoppingkaro.auth.web.Dtos.TokenResponse;
import com.shoppingkaro.auth.web.Dtos.UserView;
import com.shoppingkaro.auth.web.Dtos.VerificationRequired;
import com.shoppingkaro.common.AppException;
import com.shoppingkaro.contracts.Role;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private static final String BAD_CREDENTIALS = "Invalid email or password";

  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final TokenService tokens;
  private final OtpService otp;
  private final GoogleIdentityVerifier google;
  /** Compared against when the email is unknown or has no password, so login time does not reveal which emails exist. */
  private final String dummyHash;

  public AuthService(UserRepository users, PasswordEncoder encoder, TokenService tokens, OtpService otp, GoogleIdentityVerifier google) {
    this.users = users;
    this.encoder = encoder;
    this.tokens = tokens;
    this.otp = otp;
    this.google = google;
    this.dummyHash = encoder.encode(UUID.randomUUID().toString());
  }

  /** Creates the account but issues no tokens: the user must first enter the code emailed to them. */
  public VerificationRequired register(RegisterRequest req) {
    String email = normalize(req.email());
    String hash = encoder.encode(req.password());
    String name = req.name().trim();

    Optional<UserDocument> existing = users.findByEmail(email);
    UserDocument user;
    if (existing.isPresent()) {
      user = existing.get();
      if (user.isEmailVerified()) {
        throw AppException.conflict("An account with this email already exists");
      }
      // Never verified, so the earlier attempt did not prove ownership of the address: let this attempt replace it.
      user.replaceUnverifiedRegistration(name, hash);
    } else {
      user = new UserDocument(UUID.randomUUID().toString(), email, hash, name, Set.of(Role.BUYER), Instant.now());
    }
    try {
      users.save(user);
    } catch (DuplicateKeyException e) { // lost a race with a concurrent registration
      throw AppException.conflict("An account with this email already exists");
    }
    otp.issue(user);
    return new VerificationRequired(email);
  }

  public TokenResponse verifyEmail(String rawEmail, String code) {
    UserDocument user = users.findByEmail(normalize(rawEmail))
        .orElseThrow(() -> new AppException(HttpStatus.BAD_REQUEST, "INVALID_OTP", "That code is incorrect or has expired."));
    if (user.isEmailVerified()) {
      throw new AppException(HttpStatus.BAD_REQUEST, "ALREADY_VERIFIED", "This email is already verified. Please sign in.");
    }
    otp.verify(user, code);
    user.markEmailVerified();
    users.save(user);
    return respond(user);
  }

  /** Always succeeds from the caller's point of view, so it cannot be used to discover which emails have accounts. */
  public void resendOtp(String rawEmail) {
    users.findByEmail(normalize(rawEmail)).filter(u -> !u.isEmailVerified()).ifPresent(otp::issue);
  }

  public TokenResponse login(LoginRequest req) {
    var found = users.findByEmail(normalize(req.email()));
    String hash = found.map(UserDocument::getPasswordHash).orElse(dummyHash);
    boolean ok = encoder.matches(req.password(), hash);
    if (found.isEmpty() || !ok) {
      throw AppException.unauthorized(BAD_CREDENTIALS);
    }
    UserDocument user = found.get();
    if (!user.isEmailVerified()) {
      // Password is right, so revealing this is safe. Send a fresh code so the UI can move straight to the code step.
      otp.issue(user);
      throw new AppException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", "Please verify your email first. We've sent you a new code.");
    }
    return respond(user);
  }

  /** Sign in (or sign up) with a Google ID token. Google has already verified the email, so no code is needed. */
  public TokenResponse googleLogin(String credential) {
    var profile = google.verify(credential);
    String email = normalize(profile.email());
    UserDocument user = users.findByEmail(email).orElse(null);
    if (user == null) {
      user = new UserDocument(UUID.randomUUID().toString(), email, null, profile.name().trim(), Set.of(Role.BUYER), Instant.now());
    } else if (user.getGoogleId() != null && !user.getGoogleId().equals(profile.subject())) {
      throw AppException.unauthorized("This email is linked to a different Google account.");
    }
    user.verifyViaGoogle(profile.subject());
    try {
      users.save(user);
    } catch (DuplicateKeyException e) { // concurrent first-time Google sign-in for the same address
      user = users.findByEmail(email).orElseThrow();
    }
    return respond(user);
  }

  public TokenResponse refresh(String refreshToken) {
    String userId = tokens.redeem(refreshToken).orElseThrow(() -> AppException.unauthorized("Invalid or expired refresh token"));
    UserDocument user = users.findById(userId).orElseThrow(() -> AppException.unauthorized("Invalid or expired refresh token"));
    return respond(user);
  }

  public void logout(String refreshToken) {
    tokens.revoke(refreshToken);
  }

  public UserView me(String userId) {
    return view(users.findById(userId).orElseThrow(() -> AppException.notFound("User")));
  }

  private TokenResponse respond(UserDocument user) {
    var t = tokens.issue(user);
    return new TokenResponse(t.accessToken(), t.refreshToken(), "Bearer", t.expiresInSeconds(), view(user));
  }

  private static UserView view(UserDocument u) {
    return new UserView(u.getId(), u.getEmail(), u.getName(), u.getRoles());
  }

  private static String normalize(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }
}
