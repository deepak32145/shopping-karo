package com.shoppingkaro.order.domain;

import com.shoppingkaro.contracts.OrderStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface OrderRepository extends MongoRepository<Order, String> {
  List<Order> findByUserIdOrderByCreatedAtDesc(String userId, Pageable page);

  /** Ownership is part of the lookup: someone else's order id simply isn't found. */
  Optional<Order> findByIdAndUserId(String id, String userId);

  List<Order> findByUserIdAndStatus(String userId, OrderStatus status);

  List<Order> findByStatusAndExpiresAtBefore(OrderStatus status, Instant cutoff);

  List<Order> findByStatusAndStockReleasedFalse(OrderStatus status, Pageable page);
}
