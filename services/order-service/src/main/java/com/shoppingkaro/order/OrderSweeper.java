package com.shoppingkaro.order;

import com.shoppingkaro.contracts.OrderStatus;
import com.shoppingkaro.order.domain.Order;
import com.shoppingkaro.order.domain.OrderRepository;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background housekeeping that keeps stock honest. */
@Component
public class OrderSweeper {
  private static final Logger log = LoggerFactory.getLogger(OrderSweeper.class);

  private final OrderRepository orders;
  private final OrderService service;

  public OrderSweeper(OrderRepository orders, OrderService service) {
    this.orders = orders;
    this.service = service;
  }

  /** Orders nobody paid for give their stock back to the shelf. */
  @Scheduled(fixedDelayString = "${orders.sweep-ms:60000}")
  public void cancelUnpaidOrders() {
    for (Order order : orders.findByStatusAndExpiresAtBefore(OrderStatus.PAYMENT_PENDING, Instant.now())) {
      try {
        service.cancel(order, "system", "Payment window expired");
        log.info("Cancelled unpaid order {}", order.getOrderNumber());
      } catch (RuntimeException e) {
        log.warn("Could not expire order {}: {}", order.getOrderNumber(), e.getMessage()); // e.g. edited at the same moment; next sweep retries
      }
    }
  }

  /** Cancellations whose stock release failed (catalogue was down) are retried until they succeed. */
  @Scheduled(fixedDelayString = "${orders.sweep-ms:60000}", initialDelay = 30_000)
  public void retryStockReleases() {
    for (Order order : orders.findByStatusAndStockReleasedFalse(OrderStatus.CANCELLED, PageRequest.of(0, 50))) {
      if (service.safeRelease(order.getId())) {
        order.markStockReleased();
        orders.save(order);
        log.info("Stock for cancelled order {} released on retry", order.getOrderNumber());
      }
    }
  }
}
