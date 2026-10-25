package com.shoppingkaro.order.clients;

import java.util.List;

/** cart-service: the signed-in user's saved cart. Calls carry the user's own token. */
public interface CartClient {
  record Line(String productId, int qty) {}

  List<Line> get(String bearer);

  void clear(String bearer);
}
