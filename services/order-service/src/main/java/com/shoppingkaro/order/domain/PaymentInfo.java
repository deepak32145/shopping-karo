package com.shoppingkaro.order.domain;

import com.shoppingkaro.order.payment.PaymentMethod;
import java.time.Instant;

/**
 * Where the payment stands. Card numbers are never stored: only a label such as "Visa •••• 4242".
 *
 * @param reference gateway reference, used to refund
 * @param detail    what to show the customer ("Visa •••• 4242", "UPI asha@okbank", "Cash on delivery")
 */
public record PaymentInfo(PaymentMethod method, Status status, String reference, String detail, String failureReason, int attempts, Instant paidAt) {
  public enum Status { NOT_STARTED, FAILED, PAID, PAY_ON_DELIVERY, REFUNDED }

  public static PaymentInfo none() {
    return new PaymentInfo(null, Status.NOT_STARTED, null, null, null, 0, null);
  }

  public PaymentInfo failed(PaymentMethod m, String reason) {
    return new PaymentInfo(m, Status.FAILED, reference, null, reason, attempts + 1, null);
  }

  public PaymentInfo paid(PaymentMethod m, String ref, String detail) {
    return new PaymentInfo(m, Status.PAID, ref, detail, null, attempts + 1, Instant.now());
  }

  public PaymentInfo payOnDelivery() {
    return new PaymentInfo(PaymentMethod.COD, Status.PAY_ON_DELIVERY, null, "Cash on delivery", null, attempts, null);
  }

  public PaymentInfo paidOnDelivery() {
    return new PaymentInfo(method, Status.PAID, reference, detail, null, attempts, Instant.now());
  }

  public PaymentInfo refunded() {
    return new PaymentInfo(method, Status.REFUNDED, reference, detail, null, attempts, paidAt);
  }
}
