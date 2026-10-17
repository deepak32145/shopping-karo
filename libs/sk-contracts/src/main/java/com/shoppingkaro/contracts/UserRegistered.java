package com.shoppingkaro.contracts;

import java.util.Set;
import java.util.UUID;

public record UserRegistered(UUID userId, String email, Set<Role> roles) {
  public static final String TYPE = "UserRegistered";
}
