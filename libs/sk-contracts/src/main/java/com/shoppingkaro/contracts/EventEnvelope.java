package com.shoppingkaro.contracts;

import java.time.Instant;
import java.util.UUID;

/** Envelope for every domain event published via SNS (DESIGN.md section 4, rules 3 and 4). */
public record EventEnvelope<T>(UUID eventId, String type, Instant occurredAt, String traceId, T payload) {
  public static <T> EventEnvelope<T> of(String type, T payload, String traceId) {
    return new EventEnvelope<>(UUID.randomUUID(), type, Instant.now(), traceId, payload);
  }
}
