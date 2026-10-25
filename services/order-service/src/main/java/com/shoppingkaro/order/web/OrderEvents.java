package com.shoppingkaro.order.web;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Pushes order changes to open browser tabs (Server-Sent Events): admins see every order, a customer sees their own.
 * Connections are held in memory, so this works for a single instance; running several would move this onto a
 * shared channel (Redis pub/sub or SNS), which the publish() method is the one place to change.
 */
@Component
public class OrderEvents {
  private static final Logger log = LoggerFactory.getLogger(OrderEvents.class);
  private static final long NO_TIMEOUT = 0L;

  private final Set<SseEmitter> admins = ConcurrentHashMap.newKeySet();
  private final Map<String, Set<SseEmitter>> customers = new ConcurrentHashMap<>();

  public SseEmitter subscribeAdmin() {
    return register(admins);
  }

  public SseEmitter subscribeCustomer(String userId) {
    return register(customers.computeIfAbsent(userId, id -> ConcurrentHashMap.newKeySet()));
  }

  private SseEmitter register(Set<SseEmitter> group) {
    SseEmitter emitter = new SseEmitter(NO_TIMEOUT);
    group.add(emitter);
    emitter.onCompletion(() -> group.remove(emitter));
    emitter.onTimeout(() -> group.remove(emitter));
    emitter.onError(e -> group.remove(emitter));
    send(group, emitter, SseEmitter.event().name("ready").data("ok"));
    return emitter;
  }

  /** @param type ORDER_CREATED or ORDER_UPDATED */
  public void publish(String type, OrderView order, String ownerId) {
    var event = SseEmitter.event().name(type).data(order, MediaType.APPLICATION_JSON);
    admins.forEach(e -> send(admins, e, event));
    Set<SseEmitter> mine = customers.get(ownerId);
    if (mine != null) mine.forEach(e -> send(mine, e, event));
  }

  /** Keeps idle connections alive through proxies and detects closed tabs. */
  @Scheduled(fixedRate = 25_000)
  void heartbeat() {
    var ping = SseEmitter.event().comment("keep-alive");
    admins.forEach(e -> send(admins, e, ping));
    customers.values().forEach(group -> group.forEach(e -> send(group, e, ping)));
  }

  private void send(Set<SseEmitter> group, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
    try {
      emitter.send(event);
    } catch (IOException | IllegalStateException e) {
      group.remove(emitter); // the tab went away
      log.debug("Dropped a closed event stream");
    }
  }
}
