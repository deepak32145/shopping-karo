package com.shoppingkaro.auth.google;

/** Verifies the ID token ("credential") that the Google Sign-In button hands to the browser. */
public interface GoogleIdentityVerifier {
  /** Google's account id ("sub"), the email Google has verified, and the display name. */
  record GoogleProfile(String subject, String email, String name) {}

  /** @throws com.shoppingkaro.common.AppException 401 if the token is invalid, expired or meant for another app */
  GoogleProfile verify(String idToken);
}
