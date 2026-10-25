package com.shoppingkaro.auth.otp;

/** Delivers a one-time email verification code to the user. */
public interface OtpNotifier {
  void send(String toEmail, String name, String code);
}
