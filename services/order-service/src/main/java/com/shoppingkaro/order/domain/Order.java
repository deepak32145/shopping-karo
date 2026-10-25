package com.shoppingkaro.order.domain;

import com.shoppingkaro.contracts.OrderStatus;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * An order. Item prices and the delivery address are copied in at checkout, so later edits to the catalogue or the
 * address book never change what was ordered. Money is integer paise.
 */
@Document("orders")
@CompoundIndex(name = "status_created", def = "{'status': 1, 'createdAt': -1}")
@CompoundIndex(name = "user_created", def = "{'userId': 1, 'createdAt': -1}")
public class Order {
  @Id
  private String id;

  /** Two simultaneous edits (customer cancels while admin ships) fail loudly instead of overwriting each other. */
  @Version
  private Long version;

  @Indexed(unique = true)
  private String orderNumber;

  private String userId;
  private String userEmail;
  private List<OrderItem> items;
  private ShippingAddress address;
  private long subtotal;
  private long shipping;
  private long total;
  private String currency = "INR";
  private OrderStatus status;
  private PaymentInfo payment;
  private List<StatusChange> history = new ArrayList<>();
  /** When an unpaid order gives up its stock. Null once the order is paid. */
  private Instant expiresAt;
  /** Set once the reserved stock has been handed back to the catalogue (cancelled orders). */
  private boolean stockReleased;
  private Instant createdAt;
  private Instant updatedAt;

  protected Order() {}

  public Order(String id, String orderNumber, String userId, String userEmail, List<OrderItem> items, ShippingAddress address,
               long subtotal, long shipping, Instant expiresAt, Instant now) {
    this.id = id;
    this.orderNumber = orderNumber;
    this.userId = userId;
    this.userEmail = userEmail;
    this.items = List.copyOf(items);
    this.address = address;
    this.subtotal = subtotal;
    this.shipping = shipping;
    this.total = subtotal + shipping;
    this.status = OrderStatus.PAYMENT_PENDING;
    this.payment = PaymentInfo.none();
    this.expiresAt = expiresAt;
    this.createdAt = now;
    this.updatedAt = now;
    record(OrderStatus.PAYMENT_PENDING, "customer", "Order placed");
  }

  /** Moves to a new status and writes it to the history. */
  public void moveTo(OrderStatus next, String by, String note) {
    this.status = next;
    record(next, by, note);
  }

  private void record(OrderStatus s, String by, String note) {
    Instant now = Instant.now();
    this.updatedAt = now;
    this.history.add(new StatusChange(s, now, by, note));
  }

  public void setPayment(PaymentInfo payment) {
    this.payment = payment;
    this.updatedAt = Instant.now();
  }

  public void clearExpiry() {
    this.expiresAt = null;
  }

  public void markStockReleased() {
    this.stockReleased = true;
  }

  public String getId() { return id; }
  public String getOrderNumber() { return orderNumber; }
  public String getUserId() { return userId; }
  public String getUserEmail() { return userEmail; }
  public List<OrderItem> getItems() { return items; }
  public ShippingAddress getAddress() { return address; }
  public long getSubtotal() { return subtotal; }
  public long getShipping() { return shipping; }
  public long getTotal() { return total; }
  public String getCurrency() { return currency; }
  public OrderStatus getStatus() { return status; }
  public PaymentInfo getPayment() { return payment; }
  public List<StatusChange> getHistory() { return history; }
  public Instant getExpiresAt() { return expiresAt; }
  public boolean isStockReleased() { return stockReleased; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}
