package com.shoppingkaro.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shoppingkaro.order.payment.FakePaymentGateway;
import com.shoppingkaro.order.payment.PaymentGateway;
import com.shoppingkaro.order.payment.PaymentMethod;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;

class FakePaymentGatewayTest {
  private final FakePaymentGateway gateway = new FakePaymentGateway(new OrderProperties("", "", "", "", 15, 49900, 4900, 0, 5));
  private static final String FUTURE = String.format("%02d/%02d", 12, (YearMonth.now().getYear() + 3) % 100);

  private PaymentGateway.Result card(String number, String expiry, String cvv) {
    return gateway.charge(new PaymentGateway.Charge("SK-1", 1000, PaymentMethod.CARD, new PaymentGateway.Card(number, expiry, cvv, "Asha"), null));
  }

  private PaymentGateway.Result upi(String id) {
    return gateway.charge(new PaymentGateway.Charge("SK-1", 1000, PaymentMethod.UPI, null, id));
  }

  @Test
  void testCardsBehaveLikeARealProvidersTestMode() {
    var ok = card("4111 1111 1111 1111", FUTURE, "123");
    assertTrue(ok.success());
    assertEquals("Visa •••• 1111", ok.detail());
    assertNotNull(ok.reference());
    assertEquals("Mastercard •••• 4444", card("5555555555554444", FUTURE, "123").detail());

    assertFalse(card("4000000000000002", FUTURE, "123").success());
    assertTrue(card("4000000000009995", FUTURE, "123").failureReason().contains("Insufficient"));
    assertTrue(card("4000000000000069", FUTURE, "123").failureReason().contains("expired"));
  }

  @Test
  void rejectsBadCardDetails() {
    assertFalse(card("4111111111111112", FUTURE, "123").success(), "fails the Luhn check");
    assertFalse(card("1234", FUTURE, "123").success(), "too short");
    assertFalse(card("4111111111111111", "01/20", "123").success(), "expired date");
    assertFalse(card("4111111111111111", "13/30", "123").success(), "month out of range");
    assertFalse(card("4111111111111111", FUTURE, "12").success(), "short cvv");
    assertFalse(card(null, null, null).success());
  }

  @Test
  void upiIdsSucceedUnlessTheyAskToFail() {
    assertEquals("UPI asha@okbank", upi("asha@okbank").detail());
    assertFalse(upi("fail.me@okbank").success());
    assertFalse(upi("not-a-upi-id").success());
    assertFalse(upi(null).success());
  }

  @Test
  void neverEchoesTheFullCardNumber() {
    var result = card("4242424242424242", FUTURE, "123");
    assertFalse(result.detail().contains("4242 4242"));
    assertFalse(result.detail().contains("4242424242424242"));
  }
}
