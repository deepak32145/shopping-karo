package com.shoppingkaro.order.web;

import com.shoppingkaro.contracts.OrderStatus;
import com.shoppingkaro.order.OrderService;
import com.shoppingkaro.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Store-wide order management. Everything under /admin/** is limited to the ADMIN role by the security filter chain. */
@RestController
@RequestMapping("/admin/orders")
public class AdminOrderController {
  private final OrderService service;
  private final OrderEvents events;

  public AdminOrderController(OrderService service, OrderEvents events) {
    this.service = service;
    this.events = events;
  }

  @GetMapping
  public Requests.Page<OrderView> list(
      @RequestParam(required = false) OrderStatus status,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "25") int size) {
    return service.adminList(status, q, Math.max(0, page), Math.min(100, Math.max(1, size)));
  }

  @GetMapping("/stats")
  public Requests.Stats stats() {
    return service.stats();
  }

  /** Every new order and every status change, as it happens (Server-Sent Events). */
  @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream() {
    return events.subscribeAdmin();
  }

  @GetMapping("/{id}")
  public OrderView get(@PathVariable String id) {
    return service.adminGet(id);
  }

  @PostMapping("/{id}/status")
  public OrderView setStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody Requests.StatusUpdate req) {
    return service.adminSetStatus(CurrentUser.of(jwt), id, req.status(), req.note());
  }
}
