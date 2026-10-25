package com.shoppingkaro.auth.reset;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.auth.mail.EmailSender;
import com.shoppingkaro.auth.mail.EmailTemplates;
import org.springframework.stereotype.Component;

@Component
public class EmailPasswordResetNotifier implements PasswordResetNotifier {
  private final EmailSender email;
  private final long ttlMinutes;

  public EmailPasswordResetNotifier(EmailSender email, AuthProperties props) {
    this.email = email;
    this.ttlMinutes = props.reset().ttlMinutes();
  }

  @Override
  public void send(String toEmail, String name, String resetLink) {
    var c = EmailTemplates.passwordReset(name, resetLink, ttlMinutes);
    email.send(toEmail, c.subject(), c.text(), c.html());
  }
}
