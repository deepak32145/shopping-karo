package com.shoppingkaro.order.payment;

/**
 * The seam between orders and a payment provider. Today the only implementation is {@link FakePaymentGateway};
 * a Razorpay one replaces it without touching order logic.
 */
public interface PaymentGateway {
  /** Card details exactly as typed; they live only for the duration of the call and are never stored. */
  record Card(String number, String expiry, String cvv, String holder) {}

  record Charge(String orderNumber, long amountPaise, PaymentMethod method, Card card, String upiId) {}

  /** @param detail label that is safe to show and store, e.g. "Visa •••• 4242" */
  record Result(boolean success, String reference, String detail, String failureReason) {
    public static Result ok(String reference, String detail) {
      return new Result(true, reference, detail, null);
    }

    public static Result declined(String reason) {
      return new Result(false, null, null, reason);
    }
  }

  Result charge(Charge charge);

  /** Returns the money for a paid order that is cancelled. */
  void refund(String reference, long amountPaise);
}
