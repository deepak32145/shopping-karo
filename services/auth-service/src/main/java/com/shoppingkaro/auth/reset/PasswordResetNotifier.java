package com.shoppingkaro.auth.reset;

/** Delivers the reset link to the user by email. */
public interface PasswordResetNotifier {
  void send(String toEmail, String name, String resetLink);
}
