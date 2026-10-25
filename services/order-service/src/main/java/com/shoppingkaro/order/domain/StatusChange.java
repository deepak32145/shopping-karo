package com.shoppingkaro.order.domain;

import com.shoppingkaro.contracts.OrderStatus;
import java.time.Instant;

/** One entry of the order's timeline: what changed, when, and who did it. */
public record StatusChange(OrderStatus status, Instant at, String by, String note) {}
