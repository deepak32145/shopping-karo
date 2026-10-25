package com.shoppingkaro.order.web;

import com.shoppingkaro.order.OrderService;
import com.shoppingkaro.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** A signed-in customer's own orders. */
@RestController
@RequestMapping("/orders")
public class OrderController {
  private final OrderService service;
  private final OrderEvents events;

  public OrderController(OrderService service, OrderEvents events) {
    this.service = service;
    this.events = events;
  }

  /** Turns the saved cart into an order awaiting payment. */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public OrderView checkout(@AuthenticationPrincipal Jwt jwt, @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                            @Valid @RequestBody Requests.Checkout req) {
    return service.checkout(CurrentUser.of(jwt), authorization, req.addressId());
  }

  @GetMapping
  public List<OrderView> mine(@AuthenticationPrincipal Jwt jwt) {
    return service.listMine(CurrentUser.of(jwt));
  }

  /** Live updates for this customer's orders (Server-Sent Events). */
  @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@AuthenticationPrincipal Jwt jwt) {
    return events.subscribeCustomer(CurrentUser.of(jwt).id());
  }

  @GetMapping("/{id}")
  public OrderView get(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.getMine(CurrentUser.of(jwt), id);
  }

  @PostMapping("/{id}/pay")
  public OrderView pay(@AuthenticationPrincipal Jwt jwt, @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                       @PathVariable String id, @Valid @RequestBody Requests.Pay req) {
    return service.pay(CurrentUser.of(jwt), authorization, id, req);
  }

  @PostMapping("/{id}/cancel")
  public OrderView cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.cancelByCustomer(CurrentUser.of(jwt), id);
  }
}
