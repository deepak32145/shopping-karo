package com.shoppingkaro.auth.web;

import com.shoppingkaro.contracts.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Set;

public final class Dtos {
  private Dtos() {}

  public record RegisterRequest(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 8, max = 128, message = "must be 8 to 128 characters") String password,
      @NotBlank @Size(max = 80) String name) {}

  public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

  public record RefreshRequest(@NotBlank String refreshToken) {}

  public record ForgotPasswordRequest(@NotBlank @Email String email) {}

  public record ResetPasswordRequest(
      @NotBlank String token,
      @NotBlank @Size(min = 8, max = 128, message = "must be 8 to 128 characters") String newPassword) {}

  public record VerifyEmailRequest(
      @NotBlank @Email String email,
      @NotBlank @Pattern(regexp = "\\d{6}", message = "must be the 6-digit code from the email") String otp) {}

  public record ResendOtpRequest(@NotBlank @Email String email) {}

  public record GoogleLoginRequest(@NotBlank String credential) {}

  /** Returned by register: the account exists but cannot sign in until the emailed code is entered. */
  public record VerificationRequired(String status, String email) {
    public VerificationRequired(String email) {
      this("VERIFICATION_REQUIRED", email);
    }
  }

  public record UserView(String id, String email, String name, Set<Role> roles) {}

  public record TokenResponse(String accessToken, String refreshToken, String tokenType, long expiresIn, UserView user) {}
}
