package com.shoppingkaro.security;

import java.util.List;
import org.springframework.security.oauth2.jwt.Jwt;

/** The signed-in user, read from the verified access token. */
public record CurrentUser(String id, String email, List<String> roles) {
  public static CurrentUser of(Jwt jwt) {
    List<String> roles = jwt.getClaimAsStringList("roles");
    return new CurrentUser(jwt.getSubject(), jwt.getClaimAsString("email"), roles == null ? List.of() : roles);
  }

  public boolean isAdmin() {
    return roles.contains("ADMIN");
  }
}
