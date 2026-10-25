package com.shoppingkaro.auth.user;

import com.shoppingkaro.contracts.Role;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("users")
public class UserDocument {
  /** A new password may not equal any of this many most recent passwords (the current one included). */
  public static final int PASSWORD_HISTORY_SIZE = 3;

  @Id
  private String id;

  @Indexed(unique = true)
  private String email;

  /** Null for accounts that only ever signed in with Google. */
  private String passwordHash;

  private String name;
  private Set<Role> roles;
  private Instant createdAt;

  /** True once the user proved they own the email (OTP, Google, or a reset link). Unverified users cannot sign in. */
  private boolean emailVerified;

  /** Google account id (the "sub" claim), set when the user signs in with Google. */
  private String googleId;

  /** Hashes of the most recent passwords, newest first. Null on accounts created before this field existed. */
  private List<String> passwordHistory;

  private Instant passwordChangedAt;

  protected UserDocument() {}

  public UserDocument(String id, String email, String passwordHash, String name, Set<Role> roles, Instant createdAt) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.roles = roles;
    this.createdAt = createdAt;
    this.emailVerified = false;
    resetPassword(passwordHash, createdAt);
  }

  /**
   * Re-registration of an email that was never verified: whoever registered first has not proven they own the
   * address, so the new attempt simply replaces their details.
   */
  public void replaceUnverifiedRegistration(String name, String passwordHash) {
    this.name = name;
    resetPassword(passwordHash, Instant.now());
  }

  /** Adds the ADMIN role (keeping existing roles). Only ever called for the operator-configured admin email. */
  public void grantAdmin() {
    Set<Role> updated = new HashSet<>(roles == null ? Set.of() : roles);
    updated.add(Role.ADMIN);
    this.roles = updated;
    this.emailVerified = true;
  }

  /** Marks the email as proven by a trusted channel (OTP, reset link). */
  public void markEmailVerified() {
    this.emailVerified = true;
  }

  /**
   * Google vouches for this address. If the account was still unverified, any password on it was set by someone who
   * never proved ownership, so it is discarded: otherwise they could sign in to the real owner's account.
   */
  public void verifyViaGoogle(String googleSub) {
    if (!emailVerified) {
      resetPassword(null, Instant.now());
    }
    this.emailVerified = true;
    this.googleId = googleSub;
  }

  /** Hashes a new password must be checked against, newest first. */
  public List<String> recentPasswordHashes() {
    if (passwordHistory == null || passwordHistory.isEmpty()) {
      return passwordHash == null ? List.of() : List.of(passwordHash);
    }
    return passwordHistory;
  }

  public void changePassword(String newHash) {
    List<String> updated = new ArrayList<>();
    updated.add(newHash);
    updated.addAll(recentPasswordHashes());
    this.passwordHistory = new ArrayList<>(updated.subList(0, Math.min(PASSWORD_HISTORY_SIZE, updated.size())));
    this.passwordHash = newHash;
    this.passwordChangedAt = Instant.now();
  }

  private void resetPassword(String hash, Instant at) {
    this.passwordHash = hash;
    this.passwordHistory = hash == null ? new ArrayList<>() : new ArrayList<>(List.of(hash));
    this.passwordChangedAt = at;
  }

  public String getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public String getName() {
    return name;
  }

  public Set<Role> getRoles() {
    return roles;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public boolean isEmailVerified() {
    return emailVerified;
  }

  public String getGoogleId() {
    return googleId;
  }
}
