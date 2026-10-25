package com.shoppingkaro.order;

import com.shoppingkaro.common.AppException;
import com.shoppingkaro.contracts.OrderStatus;
import com.shoppingkaro.order.clients.AddressClient;
import com.shoppingkaro.order.clients.CartClient;
import com.shoppingkaro.order.clients.CatalogClient;
import com.shoppingkaro.order.domain.Order;
import com.shoppingkaro.order.domain.OrderItem;
import com.shoppingkaro.order.domain.OrderRepository;
import com.shoppingkaro.order.domain.PaymentInfo;
import com.shoppingkaro.order.domain.ShippingAddress;
import com.shoppingkaro.order.payment.PaymentGateway;
import com.shoppingkaro.order.payment.PaymentMethod;
import com.shoppingkaro.order.web.OrderEvents;
import com.shoppingkaro.order.web.OrderView;
import com.shoppingkaro.order.web.Requests;
import com.shoppingkaro.security.CurrentUser;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
  private static final Logger log = LoggerFactory.getLogger(OrderService.class);
  private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
  private static final String ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  private static final SecureRandom RANDOM = new SecureRandom();

  /** What an admin may do next. Orders only move forward, or are cancelled before they ship. */
  private static final Map<OrderStatus, Set<OrderStatus>> ADMIN_MOVES = Map.of(
      OrderStatus.PAYMENT_PENDING, Set.of(OrderStatus.CANCELLED),
      OrderStatus.CONFIRMED, Set.of(OrderStatus.PACKED, OrderStatus.CANCELLED),
      OrderStatus.PACKED, Set.of(OrderStatus.SHIPPED, OrderStatus.CANCELLED),
      OrderStatus.SHIPPED, Set.of(OrderStatus.DELIVERED),
      OrderStatus.DELIVERED, Set.of(),
      OrderStatus.CANCELLED, Set.of(),
      OrderStatus.PENDING, Set.of());

  private static final Set<OrderStatus> CUSTOMER_CAN_CANCEL = EnumSet.of(OrderStatus.PAYMENT_PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED);
  private static final Set<OrderStatus> COUNTS_AS_SALES = EnumSet.of(OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED);

  private final OrderRepository orders;
  private final MongoTemplate mongo;
  private final CatalogClient catalog;
  private final CartClient carts;
  private final AddressClient addresses;
  private final PaymentGateway gateway;
  private final OrderEvents events;
  private final OrderProperties props;

  public OrderService(OrderRepository orders, MongoTemplate mongo, CatalogClient catalog, CartClient carts, AddressClient addresses,
                      PaymentGateway gateway, OrderEvents events, OrderProperties props) {
    this.orders = orders;
    this.mongo = mongo;
    this.catalog = catalog;
    this.carts = carts;
    this.addresses = addresses;
    this.gateway = gateway;
    this.events = events;
    this.props = props;
  }

  // ======================= customer =======================

  /**
   * Turns the user's saved cart into an order awaiting payment. Prices come from the catalogue now, not from the
   * browser, and the stock is taken immediately (and given back if the order is cancelled or not paid in time).
   */
  public OrderView checkout(CurrentUser user, String bearer, String addressId) {
    AddressClient.Address address = addresses.find(addressId, bearer)
        .orElseThrow(() -> new AppException(HttpStatus.BAD_REQUEST, "ADDRESS_NOT_FOUND", "Choose a delivery address to continue."));

    List<CartClient.Line> cart = carts.get(bearer);
    if (cart.isEmpty()) throw new AppException(HttpStatus.BAD_REQUEST, "CART_EMPTY", "Your cart is empty.");

    Map<String, CatalogClient.Product> products = catalog.findProducts(cart.stream().map(CartClient.Line::productId).toList()).stream()
        .collect(Collectors.toMap(CatalogClient.Product::id, p -> p));

    List<OrderItem> items = new ArrayList<>();
    long subtotal = 0;
    for (CartClient.Line line : cart) {
      CatalogClient.Product p = products.get(line.productId());
      if (p == null || !"ACTIVE".equals(p.status())) {
        throw AppException.conflict("An item in your cart is no longer available. Remove it and try again.");
      }
      long lineTotal = Math.multiplyExact(p.price(), (long) line.qty());
      items.add(new OrderItem(p.id(), p.title(), p.seller(), p.emoji(), p.price(), line.qty(), lineTotal));
      subtotal += lineTotal;
    }
    long shipping = subtotal >= props.freeShippingThreshold() ? 0 : props.shippingFee();

    // One unpaid order at a time: a new checkout replaces the old one and frees its stock.
    for (Order stale : orders.findByUserIdAndStatus(user.id(), OrderStatus.PAYMENT_PENDING)) {
      cancel(stale, "system", "Replaced by a newer checkout");
    }

    String orderId = java.util.UUID.randomUUID().toString();
    catalog.reserve(orderId, items.stream().map(i -> new CatalogClient.Line(i.productId(), i.qty())).toList());

    Instant now = Instant.now();
    ShippingAddress snapshot = new ShippingAddress(address.fullName(), address.phone(), address.line1(), address.line2(),
        address.landmark(), address.city(), address.state(), address.pincode());
    Order saved;
    try {
      saved = saveNew(orderId, user, items, snapshot, subtotal, shipping, now.plus(Duration.ofMinutes(props.pendingTtlMinutes())), now);
    } catch (RuntimeException e) {
      safeRelease(orderId); // the order never existed: put the stock straight back
      throw e;
    }
    publish("ORDER_CREATED", saved);
    return OrderView.of(saved);
  }

  private Order saveNew(String id, CurrentUser user, List<OrderItem> items, ShippingAddress address, long subtotal, long shipping, Instant expiresAt, Instant now) {
    for (int attempt = 1; ; attempt++) {
      try {
        return orders.save(new Order(id, newOrderNumber(), user.id(), user.email(), items, address, subtotal, shipping, expiresAt, now));
      } catch (DuplicateKeyException e) {
        if (attempt >= 5) throw e; // an order-number collision is a one-in-a-billion event; five in a row is a bug
      }
    }
  }

  /** Takes payment for an order. Safe to call again after it succeeded. */
  public OrderView pay(CurrentUser user, String bearer, String orderId, Requests.Pay req) {
    Order order = owned(user.id(), orderId);

    if (order.getStatus() != OrderStatus.PAYMENT_PENDING) {
      PaymentInfo.Status p = order.getPayment().status();
      if (order.getStatus() != OrderStatus.CANCELLED && (p == PaymentInfo.Status.PAID || p == PaymentInfo.Status.PAY_ON_DELIVERY)) {
        return OrderView.of(order); // a double-click or a retry after a timeout: already done
      }
      throw new AppException(HttpStatus.CONFLICT, "NOT_PAYABLE", "This order can no longer be paid.");
    }
    if (order.getExpiresAt() != null && order.getExpiresAt().isBefore(Instant.now())) {
      cancel(order, "system", "Payment window expired");
      throw new AppException(HttpStatus.CONFLICT, "ORDER_EXPIRED", "This order expired before it was paid. Please check out again.");
    }

    if (req.method() == PaymentMethod.COD) {
      order.setPayment(order.getPayment().payOnDelivery());
      confirm(order, "Order confirmed. Pay cash on delivery.");
    } else {
      PaymentGateway.Result result = gateway.charge(new PaymentGateway.Charge(order.getOrderNumber(), order.getTotal(), req.method(),
          new PaymentGateway.Card(req.cardNumber(), req.expiry(), req.cvv(), req.cardholder()), req.upiId()));
      if (!result.success()) {
        order.setPayment(order.getPayment().failed(req.method(), result.failureReason()));
        if (order.getPayment().attempts() >= props.maxPaymentAttempts()) {
          cancel(order, "system", "Too many failed payment attempts");
          throw new AppException(HttpStatus.PAYMENT_REQUIRED, "PAYMENT_DECLINED",
              result.failureReason() + " Your order was cancelled after too many failed attempts.");
        }
        orders.save(order);
        throw new AppException(HttpStatus.PAYMENT_REQUIRED, "PAYMENT_DECLINED", result.failureReason());
      }
      order.setPayment(order.getPayment().paid(req.method(), result.reference(), result.detail()));
      confirm(order, "Payment received: " + result.detail());
    }

    try {
      carts.clear(bearer);
    } catch (AppException e) {
      log.warn("Order {} is placed but the cart could not be cleared: {}", order.getOrderNumber(), e.getMessage());
    }
    return OrderView.of(order);
  }

  private void confirm(Order order, String note) {
    order.moveTo(OrderStatus.CONFIRMED, "system", note);
    order.clearExpiry();
    publish("ORDER_UPDATED", orders.save(order));
  }

  public OrderView cancelByCustomer(CurrentUser user, String orderId) {
    Order order = owned(user.id(), orderId);
    if (!CUSTOMER_CAN_CANCEL.contains(order.getStatus())) {
      throw new AppException(HttpStatus.CONFLICT, "NOT_CANCELLABLE", "This order has already shipped or finished and can't be cancelled.");
    }
    return OrderView.of(cancel(order, user.email(), "Cancelled by customer"));
  }

  public OrderView getMine(CurrentUser user, String orderId) {
    return OrderView.of(owned(user.id(), orderId));
  }

  public List<OrderView> listMine(CurrentUser user) {
    return orders.findByUserIdOrderByCreatedAtDesc(user.id(), PageRequest.of(0, 50)).stream().map(OrderView::of).toList();
  }

  // ======================= admin =======================

  public Requests.Page<OrderView> adminList(OrderStatus status, String text, int page, int size) {
    Query query = new Query();
    if (status != null) query.addCriteria(Criteria.where("status").is(status));
    if (text != null && !text.isBlank()) {
      Pattern p = Pattern.compile(Pattern.quote(text.trim()), Pattern.CASE_INSENSITIVE);
      query.addCriteria(new Criteria().orOperator(
          Criteria.where("orderNumber").regex(p), Criteria.where("userEmail").regex(p), Criteria.where("address.fullName").regex(p)));
    }
    long total = mongo.count(query, Order.class);
    List<OrderView> items = mongo.find(query.with(Sort.by(Sort.Direction.DESC, "createdAt")).skip((long) page * size).limit(size), Order.class)
        .stream().map(OrderView::of).toList();
    return new Requests.Page<>(items, page, size, total);
  }

  public OrderView adminGet(String orderId) {
    return OrderView.of(orders.findById(orderId).orElseThrow(() -> AppException.notFound("Order")));
  }

  public OrderView adminSetStatus(CurrentUser admin, String orderId, OrderStatus next, String note) {
    Order order = orders.findById(orderId).orElseThrow(() -> AppException.notFound("Order"));
    if (!ADMIN_MOVES.getOrDefault(order.getStatus(), Set.of()).contains(next)) {
      throw new AppException(HttpStatus.CONFLICT, "INVALID_TRANSITION", "An order that is " + label(order.getStatus()) + " can't be marked " + label(next) + ".");
    }
    if (next == OrderStatus.CANCELLED) {
      return OrderView.of(cancel(order, admin.email(), note == null || note.isBlank() ? "Cancelled by store" : note));
    }
    order.moveTo(next, admin.email(), note);
    if (next == OrderStatus.DELIVERED && order.getPayment().status() == PaymentInfo.Status.PAY_ON_DELIVERY) {
      order.setPayment(order.getPayment().paidOnDelivery()); // the cash was collected at the door
    }
    Order saved = orders.save(order);
    publish("ORDER_UPDATED", saved);
    return OrderView.of(saved);
  }

  public Requests.Stats stats() {
    Map<OrderStatus, Long> byStatus = new EnumMap<>(OrderStatus.class);
    for (OrderStatus s : OrderStatus.values()) {
      if (s != OrderStatus.PENDING) byStatus.put(s, mongo.count(Query.query(Criteria.where("status").is(s)), Order.class));
    }
    Instant startOfToday = LocalDate.now(IST).atStartOfDay(IST).toInstant();
    Criteria sales = Criteria.where("status").in(COUNTS_AS_SALES);
    Criteria salesToday = new Criteria().andOperator(sales, Criteria.where("createdAt").gte(startOfToday));
    long ordersToday = mongo.count(Query.query(salesToday), Order.class);
    long needAttention = byStatus.get(OrderStatus.CONFIRMED) + byStatus.get(OrderStatus.PACKED);
    return new Requests.Stats(byStatus, ordersToday, sumTotal(salesToday), sumTotal(sales), needAttention);
  }

  private long sumTotal(Criteria match) {
    Document doc = mongo.aggregate(Aggregation.newAggregation(Aggregation.match(match), Aggregation.group().sum("total").as("sum")), "orders", Document.class)
        .getUniqueMappedResult();
    return doc == null ? 0 : ((Number) doc.get("sum")).longValue();
  }

  // ======================= shared =======================

  /** Cancels an order: refunds it if it was paid, and puts its stock back on sale. */
  Order cancel(Order order, String by, String note) {
    if (order.getStatus() == OrderStatus.CANCELLED) return order;
    boolean wasPaid = order.getPayment().status() == PaymentInfo.Status.PAID;
    order.moveTo(OrderStatus.CANCELLED, by, note);
    order.clearExpiry();
    if (wasPaid) {
      gateway.refund(order.getPayment().reference(), order.getTotal());
      order.setPayment(order.getPayment().refunded());
    }
    if (safeRelease(order.getId())) order.markStockReleased();
    Order saved = orders.save(order);
    publish("ORDER_UPDATED", saved);
    return saved;
  }

  /** Returns true if the stock went back. A failure is logged and retried later by the sweeper, never swallowed silently. */
  boolean safeRelease(String orderId) {
    try {
      catalog.release(orderId);
      return true;
    } catch (AppException e) {
      log.error("Could not release stock for order {} now; the sweeper will retry: {}", orderId, e.getMessage());
      return false;
    }
  }

  private Order owned(String userId, String orderId) {
    return orders.findByIdAndUserId(orderId, userId).orElseThrow(() -> AppException.notFound("Order"));
  }

  private void publish(String type, Order order) {
    events.publish(type, OrderView.of(order), order.getUserId());
  }

  private static String label(OrderStatus s) {
    return s.name().toLowerCase().replace('_', ' ');
  }

  private static String newOrderNumber() {
    StringBuilder sb = new StringBuilder("SK-").append(DateTimeFormatter.ofPattern("yyMMdd").format(LocalDate.now(IST))).append('-');
    for (int i = 0; i < 6; i++) sb.append(ORDER_NUMBER_ALPHABET.charAt(RANDOM.nextInt(ORDER_NUMBER_ALPHABET.length())));
    return sb.toString();
  }
}
