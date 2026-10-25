package com.shoppingkaro.auth.mail;

import com.shoppingkaro.common.AppException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Sends email through SMTP (Gmail for now; AWS SES in production uses the same SMTP settings).
 * When no SMTP user is configured the message is printed to the log instead, so the app still works on a fresh checkout.
 */
@Component
public class EmailSender {
  private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

  private final ObjectProvider<JavaMailSender> mailSender;
  private final String from;

  public EmailSender(ObjectProvider<JavaMailSender> mailSender, @Value("${spring.mail.username:}") String from) {
    this.mailSender = mailSender;
    this.from = from == null ? "" : from.trim();
  }

  public boolean isConfigured() {
    return !from.isEmpty() && mailSender.getIfAvailable() != null;
  }

  /** @param plainText used for the dev log fallback and as the text alternative of the email */
  public void send(String to, String subject, String plainText, String html) {
    if (!isConfigured()) {
      log.warn("DEV ONLY - SMTP not configured (set EMAIL_USER / EMAIL_PASS). Email to {} | {} | {}", to, subject, plainText);
      return;
    }
    try {
      MimeMessage message = mailSender.getObject().createMimeMessage();
      MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
      helper.setFrom(from, "Shopping Karo");
      helper.setTo(to);
      helper.setSubject(subject);
      helper.setText(plainText, html);
      mailSender.getObject().send(message);
    } catch (MailException | jakarta.mail.MessagingException | java.io.UnsupportedEncodingException e) {
      log.error("Could not send email to {}: {}", to, e.getMessage());
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_FAILED", "We couldn't send the email right now. Please try again in a minute.");
    }
  }
}
