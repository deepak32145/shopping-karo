package com.shoppingkaro.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shoppingkaro.auth.google.GoogleIdentityVerifier;
import com.shoppingkaro.auth.google.GoogleIdentityVerifier.GoogleProfile;
import com.shoppingkaro.auth.otp.OtpNotifier;
import com.shoppingkaro.auth.reset.PasswordResetNotifier;
import com.shoppingkaro.auth.user.AdminBootstrap;
import com.shoppingkaro.common.AppException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

// The blank properties stop a developer's local .env (real SMTP / Google settings) from leaking into tests.
@SpringBootTest(properties = {
  "EMAIL_USER=", "EMAIL_PASS=", "GOOGLE_CLIENT_ID=",
  "ADMIN_EMAIL=Boss@Example.com", "ADMIN_PASSWORD=boss-pass-123"
})
@AutoConfigureMockMvc
@Testcontainers
class AuthFlowTest {
  @Container
  @ServiceConnection
  static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

  @MockitoBean PasswordResetNotifier resetNotifier;
  @MockitoBean OtpNotifier otpNotifier;
  @MockitoBean GoogleIdentityVerifier googleVerifier;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  // ---------- helpers ----------

  private MvcResult call(String path, String body) throws Exception {
    return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
  }

  private JsonNode body(MvcResult r) throws Exception {
    return json.readTree(r.getResponse().getContentAsString());
  }

  private int code(MvcResult r) {
    return r.getResponse().getStatus();
  }

  private String errorCode(MvcResult r) throws Exception {
    return body(r).get("code").asText();
  }

  /** Registers and returns the 6-digit code that was "emailed". */
  private String register(String email, String password, String name) throws Exception {
    Mockito.reset(otpNotifier);
    MvcResult res = call("/auth/register",
        "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"name\":\"" + name + "\"}");
    assertEquals(201, code(res));
    assertEquals("VERIFICATION_REQUIRED", body(res).get("status").asText());
    assertFalse(body(res).has("accessToken"), "no tokens before the email is verified");
    ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
    verify(otpNotifier).send(eq(email.toLowerCase()), any(), code.capture());
    return code.getValue();
  }

  private MvcResult verifyEmail(String email, String code) throws Exception {
    return call("/auth/verify-email", "{\"email\":\"" + email + "\",\"otp\":\"" + code + "\"}");
  }

  private JsonNode registerAndVerify(String email, String password, String name) throws Exception {
    MvcResult res = verifyEmail(email, register(email, password, name));
    assertEquals(200, code(res));
    return body(res);
  }

  private int loginStatus(String email, String password) throws Exception {
    return code(call("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
  }

  private String wrongCodeFor(String code) {
    return code.equals("111111") ? "222222" : "111111";
  }

  /** Requests a reset for the email and returns the token from the emailed link. */
  private String requestResetToken(String email) throws Exception {
    Mockito.reset(resetNotifier);
    assertEquals(202, code(call("/auth/forgot-password", "{\"email\":\"" + email + "\"}")));
    ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
    verify(resetNotifier).send(eq(email), any(), link.capture());
    return link.getValue().substring(link.getValue().indexOf("reset=") + "reset=".length());
  }

  private MvcResult reset(String token, String newPassword) throws Exception {
    return call("/auth/reset-password", "{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}");
  }

  // ---------- registration with email OTP ----------

  @Test
  void registerVerifyLoginMeRefreshLogout() throws Exception {
    String email = "asha@example.com";
    String code = register("Asha@Example.com", "s3cret-pass", "Asha"); // email is normalised to lower case

    // cannot sign in before verifying, and a fresh code is sent
    Mockito.reset(otpNotifier);
    MvcResult early = call("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"s3cret-pass\"}");
    assertEquals(403, code(early));
    assertEquals("EMAIL_NOT_VERIFIED", errorCode(early));

    // wrong code is rejected, right code logs the user in
    MvcResult wrong = verifyEmail(email, wrongCodeFor(code));
    assertEquals(400, code(wrong));
    assertEquals("INVALID_OTP", errorCode(wrong));
    MvcResult verified = verifyEmail(email, code);
    assertEquals(200, code(verified));
    assertEquals("BUYER", body(verified).get("user").get("roles").get(0).asText());
    assertEquals(400, code(verifyEmail(email, code))); // the code works only once

    // duplicate email (case-insensitive) is rejected once verified
    assertEquals(409, code(call("/auth/register", "{\"email\":\"ASHA@example.com\",\"password\":\"s3cret-pass\",\"name\":\"A\"}")));

    // wrong password and unknown user get the same 401
    assertEquals(401, loginStatus(email, "wrong-pass"));
    assertEquals(401, loginStatus("nobody@example.com", "whatever1"));

    MvcResult login = call("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"s3cret-pass\"}");
    assertEquals(200, code(login));
    String access = body(login).get("accessToken").asText();
    String refresh = body(login).get("refreshToken").asText();

    mvc.perform(get("/auth/me")).andExpect(status().isUnauthorized());
    mvc.perform(get("/auth/me").header("Authorization", "Bearer " + access))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value(email));

    // refresh rotates: new token works once, old one is dead
    MvcResult rotated = call("/auth/refresh", "{\"refreshToken\":\"" + refresh + "\"}");
    assertEquals(200, code(rotated));
    String refresh2 = body(rotated).get("refreshToken").asText();
    assertNotEquals(refresh, refresh2);
    assertEquals(401, code(call("/auth/refresh", "{\"refreshToken\":\"" + refresh + "\"}")));

    assertEquals(204, code(call("/auth/logout", "{\"refreshToken\":\"" + refresh2 + "\"}")));
    assertEquals(401, code(call("/auth/refresh", "{\"refreshToken\":\"" + refresh2 + "\"}")));
  }

  @Test
  void otpIsLockedAfterFiveWrongAttempts() throws Exception {
    String email = "lock@example.com";
    String code = register(email, "pass-lock-1", "Lena");
    for (int i = 0; i < 5; i++) {
      assertEquals(400, code(verifyEmail(email, wrongCodeFor(code))));
    }
    // even the correct code no longer works: the user has to ask for a new one
    MvcResult locked = verifyEmail(email, code);
    assertEquals(400, code(locked));
    assertEquals("INVALID_OTP", errorCode(locked));
  }

  @Test
  void resendIsRateLimitedAndNeverRevealsAccounts() throws Exception {
    String email = "resend@example.com";
    register(email, "pass-resend-1", "Rey"); // sends code #1
    // inside the cooldown a resend is accepted but no second email goes out
    assertEquals(202, code(call("/auth/resend-otp", "{\"email\":\"" + email + "\"}")));
    verify(otpNotifier, times(1)).send(any(), any(), any());
    // unknown address: same answer, nothing sent
    assertEquals(202, code(call("/auth/resend-otp", "{\"email\":\"ghost2@example.com\"}")));
    verify(otpNotifier, times(1)).send(any(), any(), any());
  }

  @Test
  void reRegisteringAnUnverifiedEmailReplacesTheEarlierAttempt() throws Exception {
    String email = "again@example.com";
    String code = register(email, "first-pass-1", "Al");
    // second attempt (same address, never verified) overwrites password and name; the pending code stays valid
    assertEquals(201, code(call("/auth/register", "{\"email\":\"" + email + "\",\"password\":\"second-pass-2\",\"name\":\"Al\"}")));
    assertEquals(200, code(verifyEmail(email, code)));
    assertEquals(200, loginStatus(email, "second-pass-2"));
    assertEquals(401, loginStatus(email, "first-pass-1"));
  }

  // ---------- Google sign-in ----------

  @Test
  void googleSignInCreatesAVerifiedAccountWithoutAnEmailCode() throws Exception {
    when(googleVerifier.verify("good-token")).thenReturn(new GoogleProfile("google-sub-1", "Gina@Example.com", "Gina"));
    Mockito.reset(otpNotifier);

    MvcResult first = call("/auth/google", "{\"credential\":\"good-token\"}");
    assertEquals(200, code(first));
    assertEquals("gina@example.com", body(first).get("user").get("email").asText());
    verify(otpNotifier, never()).send(any(), any(), any());

    // second sign-in lands on the same account
    MvcResult second = call("/auth/google", "{\"credential\":\"good-token\"}");
    assertEquals(body(first).get("user").get("id").asText(), body(second).get("user").get("id").asText());

    // a Google-only account has no password to guess
    assertEquals(401, loginStatus("gina@example.com", "anything-1"));

    // bad token is rejected
    when(googleVerifier.verify("bad-token")).thenThrow(AppException.unauthorized("Google sign-in failed. Please try again."));
    assertEquals(401, code(call("/auth/google", "{\"credential\":\"bad-token\"}")));
  }

  @Test
  void googleSignInCannotBeUsedToInheritAnAttackersPassword() throws Exception {
    // An attacker registers the victim's address (never verified) with a password they know...
    register("victim@example.com", "attacker-pass-1", "Mallory");
    // ...then the real owner signs in with Google, which proves ownership.
    when(googleVerifier.verify("victim-token")).thenReturn(new GoogleProfile("google-sub-2", "victim@example.com", "Vic"));
    assertEquals(200, code(call("/auth/google", "{\"credential\":\"victim-token\"}")));
    // the attacker's password was discarded
    assertEquals(401, loginStatus("victim@example.com", "attacker-pass-1"));
  }

  // ---------- forgot / reset password ----------

  @Test
  void forgotPasswordNeverRevealsWhetherAnAccountExists() throws Exception {
    Mockito.reset(resetNotifier);
    assertEquals(202, code(call("/auth/forgot-password", "{\"email\":\"ghost@example.com\"}")));
    verify(resetNotifier, never()).send(any(), any(), any());
    assertEquals(400, code(call("/auth/forgot-password", "{\"email\":\"not-an-email\"}")));
  }

  @Test
  void resetPasswordEnforcesLastThreePasswordsRule() throws Exception {
    String email = "reset-user@example.com";
    String oldRefresh = registerAndVerify(email, "pass-one-1", "Rita").get("refreshToken").asText();

    // the current password counts as one of the last three
    String token = requestResetToken(email);
    MvcResult same = reset(token, "pass-one-1");
    assertEquals(400, code(same));
    assertEquals("PASSWORD_REUSED", errorCode(same));

    // the rejected attempt did not burn the link
    assertEquals(204, code(reset(token, "pass-two-2")));
    assertEquals(401, loginStatus(email, "pass-one-1"));
    assertEquals(200, loginStatus(email, "pass-two-2"));

    // link is single use, and a reset signs out every device
    assertEquals(400, code(reset(token, "pass-zzz-9")));
    assertEquals(401, code(call("/auth/refresh", "{\"refreshToken\":\"" + oldRefresh + "\"}")));

    // history is now [two, one]; add a third and a fourth
    assertEquals(204, code(reset(requestResetToken(email), "pass-three-3")));
    assertEquals(400, code(reset(requestResetToken(email), "pass-one-1"))); // still among last 3
    assertEquals(400, code(reset(requestResetToken(email), "pass-two-2")));
    assertEquals(204, code(reset(requestResetToken(email), "pass-four-4")));

    // history is now [four, three, two]; the very first password has aged out and is allowed again
    assertEquals(400, code(reset(requestResetToken(email), "pass-two-2")));
    assertEquals(204, code(reset(requestResetToken(email), "pass-one-1")));
    assertEquals(200, loginStatus(email, "pass-one-1"));
  }

  @Test
  void resettingThroughTheEmailedLinkAlsoVerifiesTheAddress() throws Exception {
    String email = "unverified-reset@example.com";
    register(email, "old-pass-12", "Uma");
    assertEquals(403, loginStatus(email, "old-pass-12"));
    assertEquals(204, code(reset(requestResetToken(email), "new-pass-34")));
    assertEquals(200, loginStatus(email, "new-pass-34")); // no OTP needed: the link reached the owner's inbox
  }

  @Test
  void invalidResetTokenIsRejected() throws Exception {
    MvcResult res = reset("made-up-token", "whatever-pass-1");
    assertEquals(400, code(res));
    assertEquals("INVALID_RESET_TOKEN", errorCode(res));
  }

  // ---------- admin account ----------

  @Autowired AdminBootstrap adminBootstrap;

  private JsonNode roles(MvcResult login) throws Exception {
    return body(login).get("user").get("roles");
  }

  @Test
  void adminIsSeededFromConfigAndCannotBeRegisteredByHand() throws Exception {
    MvcResult login = call("/auth/login", "{\"email\":\"boss@example.com\",\"password\":\"boss-pass-123\"}");
    assertEquals(200, code(login)); // created verified: no OTP step
    assertTrue(roles(login).toString().contains("ADMIN"));
    // the access token carries the role, which is what other services check
    String access = body(login).get("accessToken").asText();
    String payload = new String(java.util.Base64.getUrlDecoder().decode(access.split("\\.")[1]));
    assertTrue(payload.contains("\"roles\":[") && payload.contains("ADMIN"));
    // nobody can take the address over by registering
    assertEquals(409, code(call("/auth/register", "{\"email\":\"boss@example.com\",\"password\":\"hijack-pass-1\",\"name\":\"X\"}")));
  }

  @Test
  void existingAccountIsPromotedToAdminWithoutChangingItsPassword() throws Exception {
    String email = "promote-me@example.com";
    registerAndVerify(email, "orig-pass-12", "Pam");
    MvcResult before = call("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"orig-pass-12\"}");
    assertFalse(roles(before).toString().contains("ADMIN"));

    adminBootstrap.ensureAdmin(email, "ignored-for-existing");

    MvcResult after = call("/auth/login", "{\"email\":\"" + email + "\",\"password\":\"orig-pass-12\"}");
    assertEquals(200, code(after));
    assertTrue(roles(after).toString().contains("ADMIN"));
    assertTrue(roles(after).toString().contains("BUYER"));
  }

  // ---------- validation / jwks ----------

  @Test
  void validationAndJwks() throws Exception {
    assertEquals(400, code(call("/auth/register", "{\"email\":\"not-an-email\",\"password\":\"short\",\"name\":\"\"}")));
    assertEquals(400, code(call("/auth/verify-email", "{\"email\":\"a@example.com\",\"otp\":\"12ab\"}")));
    mvc.perform(get("/.well-known/jwks.json"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
        .andExpect(jsonPath("$.keys[0].d").doesNotExist()); // private part must never leak
  }
}
