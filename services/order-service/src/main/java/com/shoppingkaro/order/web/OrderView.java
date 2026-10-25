package com.shoppingkaro.order.web;

import com.shoppingkaro.contracts.OrderStatus;
import com.shoppingkaro.order.domain.Order;
import com.shoppingkaro.order.domain.OrderItem;
import com.shoppingkaro.order.domain.PaymentInfo;
import com.shoppingkaro.order.domain.ShippingAddress;
import com.shoppingkaro.order.domain.StatusChange;
import com.shoppingkaro.order.payment.PaymentMethod;
import java.time.Instant;
import java.util.List;

/** An order as the API shows it. The gateway reference is never exposed. */
public record OrderView(
    String id, String orderNumber, String userEmail, OrderStatus status, List<OrderItem> items, ShippingAddress address,
    long subtotal, long shipping, long total, String currency, PaymentView payment, List<StatusChange> history,
    Instant createdAt, Instant updatedAt, Instant expiresAt) {

  public record PaymentView(PaymentMethod method, PaymentInfo.Status status, String detail, String failureReason, Instant paidAt) {}

  public static OrderView of(Order o) {
    PaymentInfo p = o.getPayment();
    return new OrderView(o.getId(), o.getOrderNumber(), o.getUserEmail(), o.getStatus(), o.getItems(), o.getAddress(),
        o.getSubtotal(), o.getShipping(), o.getTotal(), o.getCurrency(),
        new PaymentView(p.method(), p.status(), p.detail(), p.failureReason(), p.paidAt()),
        o.getHistory(), o.getCreatedAt(), o.getUpdatedAt(), o.getExpiresAt());
  }
}
