package com.shoppingkaro.auth.google;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.common.AppException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

/** Checks signature (against Google's public keys), expiry, issuer, audience (our client id) and email_verified. */
@Component
public class GoogleTokenVerifier implements GoogleIdentityVerifier {
  private static final String GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
  private static final List<String> ISSUERS = List.of("https://accounts.google.com", "accounts.google.com");

  private final String clientId;
  private final NimbusJwtDecoder decoder;

  public GoogleTokenVerifier(AuthProperties props) {
    this.clientId = props.google().clientId() == null ? "" : props.google().clientId().trim();
    this.decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS).build();
    OAuth2TokenValidator<Jwt> issuer = jwt -> ISSUERS.contains(jwt.getIssuer() == null ? "" : jwt.getIssuer().toString())
        ? OAuth2TokenValidatorResult.success()
        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong issuer", null));
    OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience() != null && jwt.getAudience().contains(clientId)
        ? OAuth2TokenValidatorResult.success()
        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong audience", null));
    decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), issuer, audience));
  }

  @Override
  public GoogleProfile verify(String idToken) {
    if (clientId.isEmpty()) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_NOT_CONFIGURED", "Google sign-in is not available right now.");
    }
    Jwt jwt;
    try {
      jwt = decoder.decode(idToken);
    } catch (JwtException e) {
      throw AppException.unauthorized("Google sign-in failed. Please try again.");
    }
    String email = jwt.getClaimAsString("email");
    if (email == null || !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"))) {
      throw AppException.unauthorized("Your Google email address is not verified.");
    }
    String name = jwt.getClaimAsString("name");
    return new GoogleProfile(jwt.getSubject(), email, name == null || name.isBlank() ? email.substring(0, email.indexOf('@')) : name);
  }
}
