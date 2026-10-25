package com.shoppingkaro.order.payment;

import com.shoppingkaro.order.OrderProperties;
import java.time.YearMonth;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * A pretend payment provider for development. No money moves. Behaviour follows the card number, like a real
 * provider's test mode:
 * <pre>
 *   4111 1111 1111 1111   Visa, succeeds          4242 4242 4242 4242   Visa, succeeds
 *   5555 5555 5555 4444   Mastercard, succeeds    4000 0000 0000 0002   declined
 *   4000 0000 0000 9995   insufficient funds      4000 0000 0000 0069   expired card
 *   any other number that passes the Luhn check succeeds; one that does not is declined
 *   UPI: any id like name@bank succeeds; ids starting with "fail" are declined
 * </pre>
 */
@Component
public class FakePaymentGateway implements PaymentGateway {
  private static final Logger log = LoggerFactory.getLogger(FakePaymentGateway.class);
  private static final Pattern UPI = Pattern.compile("^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$");

  private final long delayMs;

  public FakePaymentGateway(OrderProperties props) {
    this.delayMs = props.paymentDelayMs();
  }

  @Override
  public Result charge(Charge c) {
    pretendToThink();
    return switch (c.method()) {
      case CARD -> chargeCard(c.card());
      case UPI -> chargeUpi(c.upiId());
      case COD -> throw new IllegalArgumentException("Cash on delivery never reaches the gateway");
    };
  }

  @Override
  public void refund(String reference, long amountPaise) {
    log.info("Fake gateway: refunded {} paise for {}", amountPaise, reference);
  }

  private Result chargeCard(Card card) {
    String number = card == null || card.number() == null ? "" : card.number().replaceAll("[\\s-]", "");
    if (!number.matches("\\d{13,19}") || !luhnValid(number)) return Result.declined("That card number isn't valid.");
    if (!expiryValid(card.expiry())) return Result.declined("Your card has expired or the expiry date is wrong.");
    if (card.cvv() == null || !card.cvv().matches("\\d{3,4}")) return Result.declined("The security code (CVV) is wrong.");

    switch (number) {
      case "4000000000000002" -> { return Result.declined("Your card was declined by the bank."); }
      case "4000000000009995" -> { return Result.declined("Insufficient funds on this card."); }
      case "4000000000000069" -> { return Result.declined("This card has expired."); }
      default -> { /* succeeds */ }
    }
    String last4 = number.substring(number.length() - 4);
    return Result.ok(reference(), brand(number) + " •••• " + last4);
  }

  private Result chargeUpi(String upiId) {
    if (upiId == null || !UPI.matcher(upiId.trim()).matches()) return Result.declined("Enter a valid UPI id, like name@bank.");
    if (upiId.trim().toLowerCase().startsWith("fail")) return Result.declined("The payment was declined by your bank.");
    return Result.ok(reference(), "UPI " + upiId.trim());
  }

  private static String reference() {
    return "fakepay_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
  }

  private static String brand(String number) {
    return switch (number.charAt(0)) {
      case '4' -> "Visa";
      case '5' -> "Mastercard";
      case '3' -> "Amex";
      case '6' -> "RuPay";
      default -> "Card";
    };
  }

  private static boolean expiryValid(String expiry) {
    if (expiry == null || !expiry.matches("(0[1-9]|1[0-2])\\s?/\\s?\\d{2}")) return false;
    String[] parts = expiry.replace(" ", "").split("/");
    YearMonth end = YearMonth.of(2000 + Integer.parseInt(parts[1]), Integer.parseInt(parts[0]));
    return !end.isBefore(YearMonth.now());
  }

  static boolean luhnValid(String digits) {
    int sum = 0;
    boolean alternate = false;
    for (int i = digits.length() - 1; i >= 0; i--) {
      int d = digits.charAt(i) - '0';
      if (alternate) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      alternate = !alternate;
    }
    return sum % 10 == 0;
  }

  private void pretendToThink() {
    if (delayMs <= 0) return;
    try {
      Thread.sleep(delayMs);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
