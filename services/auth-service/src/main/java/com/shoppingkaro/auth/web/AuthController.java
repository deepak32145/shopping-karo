package com.shoppingkaro.auth.web;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.shoppingkaro.auth.AuthService;
import com.shoppingkaro.auth.reset.PasswordResetService;
import com.shoppingkaro.auth.web.Dtos.ForgotPasswordRequest;
import com.shoppingkaro.auth.web.Dtos.GoogleLoginRequest;
import com.shoppingkaro.auth.web.Dtos.LoginRequest;
import com.shoppingkaro.auth.web.Dtos.RefreshRequest;
import com.shoppingkaro.auth.web.Dtos.RegisterRequest;
import com.shoppingkaro.auth.web.Dtos.ResendOtpRequest;
import com.shoppingkaro.auth.web.Dtos.ResetPasswordRequest;
import com.shoppingkaro.auth.web.Dtos.TokenResponse;
import com.shoppingkaro.auth.web.Dtos.UserView;
import com.shoppingkaro.auth.web.Dtos.VerificationRequired;
import com.shoppingkaro.auth.web.Dtos.VerifyEmailRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
  private final AuthService auth;
  private final RSAKey signingKey;
  private final PasswordResetService passwordReset;

  public AuthController(AuthService auth, RSAKey signingKey, PasswordResetService passwordReset) {
    this.passwordReset = passwordReset;
    this.auth = auth;
    this.signingKey = signingKey;
  }

  /** Creates the account and emails a 6-digit code. No tokens until the code is verified. */
  @PostMapping("/auth/register")
  @ResponseStatus(HttpStatus.CREATED)
  public VerificationRequired register(@Valid @RequestBody RegisterRequest req) {
    return auth.register(req);
  }

  @PostMapping("/auth/verify-email")
  public TokenResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest req) {
    return auth.verifyEmail(req.email(), req.otp());
  }

  /** Always 202, whether or not the email has an unverified account. */
  @PostMapping("/auth/resend-otp")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void resendOtp(@Valid @RequestBody ResendOtpRequest req) {
    auth.resendOtp(req.email());
  }

  @PostMapping("/auth/login")
  public TokenResponse login(@Valid @RequestBody LoginRequest req) {
    return auth.login(req);
  }

  /** Sign in or sign up with the ID token from the "Sign in with Google" button. No email code needed. */
  @PostMapping("/auth/google")
  public TokenResponse google(@Valid @RequestBody GoogleLoginRequest req) {
    return auth.googleLogin(req.credential());
  }

  @PostMapping("/auth/refresh")
  public TokenResponse refresh(@Valid @RequestBody RefreshRequest req) {
    return auth.refresh(req.refreshToken());
  }

  @PostMapping("/auth/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(@Valid @RequestBody RefreshRequest req) {
    auth.logout(req.refreshToken());
  }

  /** Always 202, whether or not the email has an account, so it cannot be used to discover accounts. */
  @PostMapping("/auth/forgot-password")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
    passwordReset.request(req.email());
  }

  @PostMapping("/auth/reset-password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
    passwordReset.reset(req.token(), req.newPassword());
  }

  @GetMapping("/auth/me")
  public UserView me(@AuthenticationPrincipal Jwt jwt) {
    return auth.me(jwt.getSubject());
  }

  /** Public keys other services/gateway use to verify access tokens. */
  @GetMapping("/.well-known/jwks.json")
  public Map<String, Object> jwks() {
    return new JWKSet(signingKey.toPublicJWK()).toJSONObject();
  }
}
