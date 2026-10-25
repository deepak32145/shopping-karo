package com.shoppingkaro.order.web;

import com.shoppingkaro.contracts.OrderStatus;
import com.shoppingkaro.order.payment.PaymentMethod;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class Requests {
  private Requests() {}

  public record Checkout(@NotBlank String addressId) {}

  public record Pay(
      @NotNull PaymentMethod method,
      @Size(max = 30) String cardNumber,
      @Size(max = 7) String expiry,
      @Size(max = 4) String cvv,
      @Size(max = 80) String cardholder,
      @Size(max = 80) String upiId) {}

  public record StatusUpdate(@NotNull OrderStatus status, @Size(max = 200) String note) {}

  public record Page<T>(List<T> items, int page, int size, long total) {}

  /** Numbers for the admin overview. Money in paise. */
  public record Stats(
      java.util.Map<OrderStatus, Long> byStatus, long ordersToday, long revenueToday, long revenueTotal, long needAttention) {}
}
