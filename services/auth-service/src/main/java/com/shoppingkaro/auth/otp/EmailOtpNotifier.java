package com.shoppingkaro.auth.otp;

import com.shoppingkaro.auth.AuthProperties;
import com.shoppingkaro.auth.mail.EmailSender;
import com.shoppingkaro.auth.mail.EmailTemplates;
import org.springframework.stereotype.Component;

@Component
public class EmailOtpNotifier implements OtpNotifier {
  private final EmailSender email;
  private final long ttlMinutes;

  public EmailOtpNotifier(EmailSender email, AuthProperties props) {
    this.email = email;
    this.ttlMinutes = props.otp().ttlMinutes();
  }

  @Override
  public void send(String toEmail, String name, String code) {
    var c = EmailTemplates.otp(name, code, ttlMinutes);
    email.send(toEmail, c.subject(), c.text(), c.html());
  }
}
