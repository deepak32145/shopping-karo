package com.shoppingkaro.auth.mail;

import org.springframework.web.util.HtmlUtils;

/** Minimal branded HTML emails. User-supplied values are always HTML-escaped. */
public final class EmailTemplates {
  private EmailTemplates() {}

  public record Content(String subject, String text, String html) {}

  public static Content otp(String name, String code, long ttlMinutes) {
    String text = "Hi " + name + ",\n\nYour Shopping Karo verification code is " + code + ".\nIt expires in " + ttlMinutes
        + " minutes. If you didn't create an account, you can ignore this email.";
    String body = "<p>Hi " + HtmlUtils.htmlEscape(name) + ",</p>"
        + "<p>Use this code to verify your email address:</p>"
        + "<div style=\"background:#fff3ec;border-radius:12px;padding:20px;text-align:center;margin:20px 0;\">"
        + "<span style=\"font-size:34px;font-weight:700;letter-spacing:10px;color:#ff5a1f;\">" + code + "</span></div>"
        + "<p>This code expires in <b>" + ttlMinutes + " minutes</b>.</p>"
        + "<p style=\"color:#6b665c;font-size:12px;\">If you didn't create an account, you can safely ignore this email.</p>";
    return new Content("Your Shopping Karo verification code: " + code, text, wrap("Verify your email", body));
  }

  public static Content passwordReset(String name, String link, long ttlMinutes) {
    String text = "Hi " + name + ",\n\nReset your Shopping Karo password using this link (valid for " + ttlMinutes + " minutes):\n"
        + link + "\n\nIf you didn't ask for this, you can ignore this email; your password won't change.";
    String body = "<p>Hi " + HtmlUtils.htmlEscape(name) + ",</p>"
        + "<p>We received a request to reset your password. This link works for <b>" + ttlMinutes + " minutes</b> and can be used once.</p>"
        + "<p style=\"text-align:center;margin:28px 0;\"><a href=\"" + HtmlUtils.htmlEscape(link) + "\" "
        + "style=\"background:#ff5a1f;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px;display:inline-block;\">"
        + "Reset my password</a></p>"
        + "<p style=\"color:#6b665c;font-size:13px;\">Button not working? Paste this into your browser:<br>" + HtmlUtils.htmlEscape(link) + "</p>"
        + "<p style=\"color:#6b665c;font-size:12px;\">If you didn't ask for this, ignore this email. Your password won't change.</p>";
    return new Content("Reset your Shopping Karo password", text, wrap("Reset your password", body));
  }

  private static String wrap(String heading, String body) {
    return "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1b1a17;\">"
        + "<h2 style=\"margin:0 0 16px;\">shopping<span style=\"color:#ff5a1f;\">karo</span></h2>"
        + "<h3 style=\"margin:0 0 8px;\">" + heading + "</h3>" + body + "</div>";
  }
}
