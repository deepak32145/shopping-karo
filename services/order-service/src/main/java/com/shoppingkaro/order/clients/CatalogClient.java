package com.shoppingkaro.order.clients;

import java.util.Collection;
import java.util.List;

/** catalog-service: product facts and stock. */
public interface CatalogClient {
  /** @param status ACTIVE / DRAFT / ARCHIVED */
  record Product(String id, String title, String seller, String emoji, long price, int stock, String status) {}

  record Line(String productId, int qty) {}

  List<Product> findProducts(Collection<String> ids);

  /** Takes the stock for an order, all or nothing. @throws com.shoppingkaro.common.AppException 409 OUT_OF_STOCK */
  void reserve(String orderId, List<Line> lines);

  /** Gives an order's stock back. Safe to call more than once. */
  void release(String orderId);
}
