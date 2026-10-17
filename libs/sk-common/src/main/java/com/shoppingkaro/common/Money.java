package com.shoppingkaro.common;

import java.text.NumberFormat;
import java.util.Locale;

/** Money is always integer minor units (paise for INR). Never floating point. */
public record Money(long amount, String currency) {
  public static final String INR = "INR";

  public static Money inr(long paise) {
    return new Money(paise, INR);
  }

  public static Money ofRupees(long rupees) {
    return inr(Math.multiplyExact(rupees, 100L));
  }

  public Money plus(Money other) {
    requireSameCurrency(other);
    return new Money(Math.addExact(amount, other.amount), currency);
  }

  public Money times(int qty) {
    return new Money(Math.multiplyExact(amount, (long) qty), currency);
  }

  public String format() {
    return NumberFormat.getCurrencyInstance(Locale.of("en", "IN")).format(amount / 100.0);
  }

  private void requireSameCurrency(Money other) {
    if (!currency.equals(other.currency)) {
      throw new IllegalArgumentException("Currency mismatch");
    }
  }
}
