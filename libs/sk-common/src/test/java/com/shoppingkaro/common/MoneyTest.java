package com.shoppingkaro.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class MoneyTest {
  @Test
  void addsAndMultipliesInMinorUnits() {
    Money total = Money.inr(10000).times(2).plus(Money.inr(250));
    assertEquals(Money.inr(20250), total);
  }

  @Test
  void rejectsCurrencyMismatch() {
    assertThrows(IllegalArgumentException.class, () -> Money.inr(1).plus(new Money(1, "USD")));
  }
}
