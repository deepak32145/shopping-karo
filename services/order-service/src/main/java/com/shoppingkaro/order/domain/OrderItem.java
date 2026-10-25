package com.shoppingkaro.order.domain;

/** A line of an order as it was sold: title and price are frozen at checkout. */
public record OrderItem(String productId, String title, String seller, String emoji, long unitPrice, int qty, long lineTotal) {}
