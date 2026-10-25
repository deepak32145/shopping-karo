package com.shoppingkaro.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.shoppingkaro.common.AppException;
import com.shoppingkaro.order.clients.AddressClient;
import com.shoppingkaro.order.clients.CartClient;
import com.shoppingkaro.order.clients.CatalogClient;
import com.shoppingkaro.order.domain.Order;
import com.shoppingkaro.order.domain.OrderRepository;
import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Import(TestJwtConfig.class)
@SpringBootTest(properties = {"orders.payment-delay-ms=0", "orders.sweep-ms=3600000", "INTERNAL_API_KEY=test-internal-key-123456"})
@AutoConfigureMockMvc
@Testcontainers
class OrderFlowTest {
  @Container
  @ServiceConnection
  static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

  @MockitoBean CatalogClient catalog;
  @MockitoBean CartClient carts;
  @MockitoBean AddressClient addresses;

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired OrderRepository orders;
  @Autowired OrderSweeper sweeper;
  @Autowired MongoTemplate mongoTemplate;

  private static final String GOOD_CARD = "4111111111111111";
  private static final String EXPIRY = String.format("12/%02d", (YearMonth.now().getYear() + 3) % 100);

  private static final CatalogClient.Product KETTLE = new CatalogClient.Product("p-kettle", "Brass Kettle", "Rasoi Works", "🫖", 129900, 10, "ACTIVE");
  private static final CatalogClient.Product MUG = new CatalogClient.Product("p-mug", "Steel Mug", "Rasoi Works", "☕", 29900, 50, "ACTIVE");

  @BeforeEach
  void freshState() {
    orders.deleteAll();
    when(addresses.find(eq("addr-1"), anyString())).thenReturn(Optional.of(
        new AddressClient.Address("addr-1", "Asha Rao", "9876543210", "12 MG Road", null, "Near the park", "Gurgaon", "Haryana", "122001")));
    when(addresses.find(eq("someone-elses"), anyString())).thenReturn(Optional.empty());
    when(carts.get(anyString())).thenReturn(List.of(new CartClient.Line("p-kettle", 1), new CartClient.Line("p-mug", 2)));
    when(catalog.findProducts(any())).thenReturn(List.of(KETTLE, MUG));
  }

  // ---------- helpers ----------

  private static String customer(String id) {
    return "Bearer " + id + ".BUYER";
  }

  private static String admin() {
    return "Bearer admin.ADMIN+BUYER";
  }

  private MvcResult call(MockHttpServletRequestBuilder req, String bearer, String body) throws Exception {
    req.header("Authorization", bearer);
    if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
    return mvc.perform(req).andReturn();
  }

  private int status(MvcResult r) {
    return r.getResponse().getStatus();
  }

  private JsonNode body(MvcResult r) throws Exception {
    return json.readTree(r.getResponse().getContentAsString());
  }

  private JsonNode checkout(String user) throws Exception {
    MvcResult r = call(post("/orders"), customer(user), "{\"addressId\":\"addr-1\"}");
    assertEquals(201, status(r), r.getResponse().getContentAsString());
    return body(r);
  }

  private static String card(String number) {
    return "{\"method\":\"CARD\",\"cardNumber\":\"" + number + "\",\"expiry\":\"" + EXPIRY + "\",\"cvv\":\"123\",\"cardholder\":\"Asha\"}";
  }

  private MvcResult pay(String user, String orderId, String payBody) throws Exception {
    return call(post("/orders/" + orderId + "/pay"), customer(user), payBody);
  }

  private JsonNode placeAndPay(String user) throws Exception {
    String id = checkout(user).get("id").asText();
    MvcResult paid = pay(user, id, card(GOOD_CARD));
    assertEquals(200, status(paid));
    return body(paid);
  }

  private MvcResult adminStatus(String orderId, String newStatus) throws Exception {
    return call(post("/admin/orders/" + orderId + "/status"), admin(), "{\"status\":\"" + newStatus + "\",\"note\":\"test\"}");
  }

  // ---------- checkout ----------

  @Test
  void checkoutNeedsASignedInUser() throws Exception {
    assertEquals(401, mvc.perform(post("/orders").contentType(MediaType.APPLICATION_JSON).content("{\"addressId\":\"addr-1\"}")).andReturn().getResponse().getStatus());
  }

  @Test
  void checkoutBuildsAnOrderFromTheCartAtCataloguePrices() throws Exception {
    JsonNode order = checkout("alice");

    assertEquals("PAYMENT_PENDING", order.get("status").asText());
    assertTrue(order.get("orderNumber").asText().matches("SK-\\d{6}-[A-Z2-9]{6}"));
    assertEquals(129900 + 2 * 29900, order.get("subtotal").asLong());
    assertEquals(0, order.get("shipping").asLong(), "over the free-shipping threshold");
    assertEquals(order.get("subtotal").asLong(), order.get("total").asLong());
    assertEquals(2, order.get("items").size());
    assertEquals(59800, order.get("items").get(1).get("lineTotal").asLong());
    assertEquals("Asha Rao", order.get("address").get("fullName").asText());
    assertEquals("122001", order.get("address").get("pincode").asText());
    assertNotNull(order.get("expiresAt").asText());
    assertEquals("NOT_STARTED", order.get("payment").get("status").asText());

    verify(catalog).reserve(eq(order.get("id").asText()), eq(List.of(new CatalogClient.Line("p-kettle", 1), new CatalogClient.Line("p-mug", 2))));
  }

  @Test
  void smallOrdersPayShipping() throws Exception {
    when(carts.get(anyString())).thenReturn(List.of(new CartClient.Line("p-mug", 1)));
    JsonNode order = checkout("alice");
    assertEquals(29900, order.get("subtotal").asLong());
    assertEquals(4900, order.get("shipping").asLong());
    assertEquals(34800, order.get("total").asLong());
  }

  @Test
  void checkoutRefusesBadInput() throws Exception {
    MvcResult noAddress = call(post("/orders"), customer("alice"), "{\"addressId\":\"someone-elses\"}");
    assertEquals(400, status(noAddress));
    assertEquals("ADDRESS_NOT_FOUND", body(noAddress).get("code").asText());

    when(carts.get(anyString())).thenReturn(List.of());
    MvcResult empty = call(post("/orders"), customer("alice"), "{\"addressId\":\"addr-1\"}");
    assertEquals("CART_EMPTY", body(empty).get("code").asText());

    when(carts.get(anyString())).thenReturn(List.of(new CartClient.Line("gone", 1)));
    when(catalog.findProducts(any())).thenReturn(List.of());
    assertEquals(409, status(call(post("/orders"), customer("alice"), "{\"addressId\":\"addr-1\"}")));

    when(carts.get(anyString())).thenReturn(List.of(new CartClient.Line("p-kettle", 1)));
    when(catalog.findProducts(any())).thenReturn(List.of(new CatalogClient.Product("p-kettle", "Brass Kettle", "R", "🫖", 129900, 10, "ARCHIVED")));
    assertEquals(409, status(call(post("/orders"), customer("alice"), "{\"addressId\":\"addr-1\"}")), "archived products cannot be bought");

    assertEquals(400, status(call(post("/orders"), customer("alice"), "{}")));
    assertEquals(0, orders.count(), "no order was created by any of these");
  }

  @Test
  void anOutOfStockItemStopsCheckoutAndCreatesNoOrder() throws Exception {
    doThrow(AppException.conflict("Only 1 of “Brass Kettle” left")).when(catalog).reserve(anyString(), any());
    MvcResult res = call(post("/orders"), customer("alice"), "{\"addressId\":\"addr-1\"}");
    assertEquals(409, status(res));
    assertTrue(body(res).get("detail").asText().contains("Only 1"));
    assertEquals(0, orders.count());
  }

  @Test
  void aNewCheckoutReplacesTheUnpaidOneAndFreesItsStock() throws Exception {
    String first = checkout("alice").get("id").asText();
    String second = checkout("alice").get("id").asText();
    verify(catalog).release(first);
    assertEquals("CANCELLED", body(call(get("/orders/" + first), customer("alice"), null)).get("status").asText());
    assertEquals("PAYMENT_PENDING", body(call(get("/orders/" + second), customer("alice"), null)).get("status").asText());
  }

  // ---------- payment ----------

  @Test
  void cardPaymentConfirmsTheOrderAndEmptiesTheCart() throws Exception {
    JsonNode paid = placeAndPay("alice");
    assertEquals("CONFIRMED", paid.get("status").asText());
    assertEquals("PAID", paid.get("payment").get("status").asText());
    assertEquals("Visa •••• 1111", paid.get("payment").get("detail").asText());
    assertTrue(paid.get("expiresAt").isNull(), "a paid order no longer expires");
    assertFalse(paid.toString().contains(GOOD_CARD), "the card number is never returned");
    assertFalse(paid.toString().contains("fakepay_"), "the gateway reference is internal");
    assertEquals(2, paid.get("history").size(), "placed, then confirmed");
    verify(carts).clear(anyString());
  }

  @Test
  void aDeclinedCardKeepsTheOrderOpenAndAllowsARetry() throws Exception {
    String id = checkout("alice").get("id").asText();
    MvcResult declined = pay("alice", id, card("4000000000000002"));
    assertEquals(402, status(declined));
    assertEquals("PAYMENT_DECLINED", body(declined).get("code").asText());

    JsonNode order = body(call(get("/orders/" + id), customer("alice"), null));
    assertEquals("PAYMENT_PENDING", order.get("status").asText());
    assertEquals("FAILED", order.get("payment").get("status").asText());
    verify(carts, never()).clear(anyString());

    assertEquals(200, status(pay("alice", id, card(GOOD_CARD))));
    assertEquals("CONFIRMED", body(call(get("/orders/" + id), customer("alice"), null)).get("status").asText());
  }

  @Test
  void tooManyFailedAttemptsCancelTheOrderAndFreeTheStock() throws Exception {
    String id = checkout("alice").get("id").asText();
    for (int i = 0; i < 4; i++) assertEquals(402, status(pay("alice", id, card("4000000000000002"))));
    MvcResult last = pay("alice", id, card("4000000000000002"));
    assertEquals(402, status(last));
    assertTrue(body(last).get("detail").asText().contains("cancelled"));
    assertEquals("CANCELLED", orders.findById(id).orElseThrow().getStatus().name());
    verify(catalog).release(id);
  }

  @Test
  void upiAndCashOnDeliveryWork() throws Exception {
    String upiOrder = checkout("alice").get("id").asText();
    assertEquals(200, status(pay("alice", upiOrder, "{\"method\":\"UPI\",\"upiId\":\"asha@okbank\"}")));
    assertEquals("UPI asha@okbank", orders.findById(upiOrder).orElseThrow().getPayment().detail());

    String failing = checkout("bob").get("id").asText();
    assertEquals(402, status(pay("bob", failing, "{\"method\":\"UPI\",\"upiId\":\"fail@okbank\"}")));

    String codOrder = checkout("carol").get("id").asText();
    MvcResult cod = pay("carol", codOrder, "{\"method\":\"COD\"}");
    assertEquals(200, status(cod));
    assertEquals("CONFIRMED", body(cod).get("status").asText());
    assertEquals("PAY_ON_DELIVERY", body(cod).get("payment").get("status").asText());

    // the cash is collected when the parcel is delivered
    adminStatus(codOrder, "PACKED");
    adminStatus(codOrder, "SHIPPED");
    assertEquals(200, status(adminStatus(codOrder, "DELIVERED")));
    assertEquals("PAID", orders.findById(codOrder).orElseThrow().getPayment().status().name());
  }

  @Test
  void payingTwiceDoesNotChargeTwice() throws Exception {
    String id = checkout("alice").get("id").asText();
    assertEquals(200, status(pay("alice", id, card(GOOD_CARD))));
    int historyAfterFirst = orders.findById(id).orElseThrow().getHistory().size();
    assertEquals(200, status(pay("alice", id, card(GOOD_CARD))));
    assertEquals(historyAfterFirst, orders.findById(id).orElseThrow().getHistory().size(), "second call changed nothing");
    assertEquals(1, orders.findById(id).orElseThrow().getPayment().attempts());
  }

  @Test
  void anExpiredOrderCannotBePaid() throws Exception {
    String id = checkout("alice").get("id").asText();
    backdateExpiry(id);
    MvcResult res = pay("alice", id, card(GOOD_CARD));
    assertEquals(409, status(res));
    assertEquals("ORDER_EXPIRED", body(res).get("code").asText());
    verify(catalog).release(id);
  }

  // ---------- cancelling ----------

  @Test
  void customersCancelBeforeShippingAndPaidOrdersAreRefunded() throws Exception {
    JsonNode paid = placeAndPay("alice");
    String id = paid.get("id").asText();
    MvcResult cancelled = call(post("/orders/" + id + "/cancel"), customer("alice"), null);
    assertEquals(200, status(cancelled));
    assertEquals("CANCELLED", body(cancelled).get("status").asText());
    assertEquals("REFUNDED", body(cancelled).get("payment").get("status").asText());
    verify(catalog).release(id);

    // an unpaid order can be cancelled too
    String unpaid = checkout("bob").get("id").asText();
    assertEquals(200, status(call(post("/orders/" + unpaid + "/cancel"), customer("bob"), null)));
    verify(catalog).release(unpaid);
  }

  @Test
  void aShippedOrderCannotBeCancelledByTheCustomer() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    adminStatus(id, "PACKED");
    adminStatus(id, "SHIPPED");
    MvcResult res = call(post("/orders/" + id + "/cancel"), customer("alice"), null);
    assertEquals(409, status(res));
    assertEquals("NOT_CANCELLABLE", body(res).get("code").asText());
    verify(catalog, never()).release(id);
  }

  @Test
  void ifTheCatalogueIsDownDuringCancelTheStockReleaseIsRetriedLater() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    doThrow(new AppException(org.springframework.http.HttpStatus.BAD_GATEWAY, "UPSTREAM_UNAVAILABLE", "down")).when(catalog).release(id);
    assertEquals(200, status(call(post("/orders/" + id + "/cancel"), customer("alice"), null)), "the customer is not blocked by it");
    Order cancelled = orders.findById(id).orElseThrow();
    assertEquals("CANCELLED", cancelled.getStatus().name());
    assertFalse(cancelled.isStockReleased());

    doNothing().when(catalog).release(id);
    sweeper.retryStockReleases();
    assertTrue(orders.findById(id).orElseThrow().isStockReleased());
  }

  @Test
  void theSweeperCancelsUnpaidOrdersWhoseWindowHasClosed() throws Exception {
    String stale = checkout("alice").get("id").asText();
    String fresh = checkout("bob").get("id").asText();
    backdateExpiry(stale);
    sweeper.cancelUnpaidOrders();
    assertEquals("CANCELLED", orders.findById(stale).orElseThrow().getStatus().name());
    assertEquals("PAYMENT_PENDING", orders.findById(fresh).orElseThrow().getStatus().name());
    verify(catalog).release(stale);
    verify(catalog, never()).release(fresh);
  }

  // ---------- ownership ----------

  @Test
  void customersOnlySeeAndChangeTheirOwnOrders() throws Exception {
    String id = checkout("alice").get("id").asText();
    assertEquals(404, status(call(get("/orders/" + id), customer("mallory"), null)));
    assertEquals(404, status(pay("mallory", id, card(GOOD_CARD))));
    assertEquals(404, status(call(post("/orders/" + id + "/cancel"), customer("mallory"), null)));
    assertEquals(0, body(call(get("/orders"), customer("mallory"), null)).size());
    assertEquals(1, body(call(get("/orders"), customer("alice"), null)).size());
    assertEquals("PAYMENT_PENDING", orders.findById(id).orElseThrow().getStatus().name());
  }

  // ---------- admin ----------

  @Test
  void adminEndpointsAreForAdminsOnly() throws Exception {
    assertEquals(401, mvc.perform(get("/admin/orders")).andReturn().getResponse().getStatus());
    assertEquals(403, status(call(get("/admin/orders"), customer("alice"), null)));
    assertEquals(403, status(call(get("/admin/orders/stats"), customer("alice"), null)));
    assertEquals(403, status(call(post("/admin/orders/x/status"), customer("alice"), "{\"status\":\"PACKED\"}")));
    assertEquals(200, status(call(get("/admin/orders"), admin(), null)));
  }

  @Test
  void anAdminMovesAnOrderThroughTheWholeJourney() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    for (String next : List.of("PACKED", "SHIPPED", "DELIVERED")) {
      MvcResult res = adminStatus(id, next);
      assertEquals(200, status(res), next);
      assertEquals(next, body(res).get("status").asText());
    }
    JsonNode history = body(call(get("/admin/orders/" + id), admin(), null)).get("history");
    assertEquals(List.of("PAYMENT_PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"), toList(history));
    assertEquals("admin@example.com", history.get(4).get("by").asText());
    // the customer sees the same timeline
    assertEquals("DELIVERED", body(call(get("/orders/" + id), customer("alice"), null)).get("status").asText());
  }

  private List<String> toList(JsonNode history) {
    java.util.ArrayList<String> out = new java.util.ArrayList<>();
    history.forEach(h -> out.add(h.get("status").asText()));
    return out;
  }

  @Test
  void ordersCannotSkipStepsOrGoBackwards() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    MvcResult skip = adminStatus(id, "DELIVERED");
    assertEquals(409, status(skip));
    assertEquals("INVALID_TRANSITION", body(skip).get("code").asText());
    assertEquals(409, status(adminStatus(id, "PAYMENT_PENDING")));
    adminStatus(id, "PACKED");
    adminStatus(id, "SHIPPED");
    assertEquals(409, status(adminStatus(id, "CANCELLED")), "too late to cancel once shipped");
    assertEquals(409, status(adminStatus(id, "PACKED")));
    adminStatus(id, "DELIVERED");
    assertEquals(409, status(adminStatus(id, "SHIPPED")));
    assertEquals(404, status(adminStatus("no-such-order", "PACKED")));
    assertEquals(400, status(call(post("/admin/orders/" + id + "/status"), admin(), "{\"status\":\"FLYING\"}")));
  }

  @Test
  void anAdminCancellingAPaidOrderRefundsItAndRestocks() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    MvcResult res = call(post("/admin/orders/" + id + "/status"), admin(), "{\"status\":\"CANCELLED\",\"note\":\"Out of stock at warehouse\"}");
    assertEquals(200, status(res));
    assertEquals("REFUNDED", body(res).get("payment").get("status").asText());
    assertEquals("Out of stock at warehouse", body(res).get("history").get(2).get("note").asText());
    verify(catalog, times(1)).release(id);
  }

  @Test
  void adminListFiltersByStatusAndSearchesAndPages() throws Exception {
    String a = placeAndPay("alice").get("id").asText();
    placeAndPay("bob");
    checkout("carol");
    adminStatus(a, "PACKED");

    JsonNode all = body(call(get("/admin/orders"), admin(), null));
    assertEquals(3, all.get("total").asInt());
    assertEquals("carol@example.com", all.get("items").get(0).get("userEmail").asText(), "newest first");

    assertEquals(1, body(call(get("/admin/orders?status=PACKED"), admin(), null)).get("total").asInt());
    assertEquals(1, body(call(get("/admin/orders?status=PAYMENT_PENDING"), admin(), null)).get("total").asInt());
    assertEquals(1, body(call(get("/admin/orders?q=BOB@exam"), admin(), null)).get("total").asInt(), "search is case-insensitive");
    assertEquals(0, body(call(get("/admin/orders?q=.*"), admin(), null)).get("total").asInt(), "search text is not a regex");

    JsonNode page = body(call(get("/admin/orders?size=2&page=1"), admin(), null));
    assertEquals(1, page.get("items").size());
    assertEquals(3, page.get("total").asInt());
  }

  @Test
  void statsSummariseTheStore() throws Exception {
    String a = placeAndPay("alice").get("id").asText(); // 189,700 paise, confirmed
    placeAndPay("bob");
    checkout("carol"); // unpaid: not a sale
    adminStatus(a, "PACKED");

    JsonNode stats = body(call(get("/admin/orders/stats"), admin(), null));
    assertEquals(1, stats.get("byStatus").get("CONFIRMED").asInt());
    assertEquals(1, stats.get("byStatus").get("PACKED").asInt());
    assertEquals(1, stats.get("byStatus").get("PAYMENT_PENDING").asInt());
    assertEquals(2 * 189700L, stats.get("revenueTotal").asLong());
    assertEquals(2 * 189700L, stats.get("revenueToday").asLong());
    assertEquals(2, stats.get("ordersToday").asInt());
    assertEquals(2, stats.get("needAttention").asInt());
  }

  // ---------- live updates ----------

  @Test
  void adminsSeeNewOrdersAndStatusChangesAsTheyHappen() throws Exception {
    MvcResult stream = mvc.perform(get("/admin/orders/stream").header("Authorization", admin()))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.request().asyncStarted()).andReturn();

    JsonNode order = checkout("alice");
    String id = order.get("id").asText();
    pay("alice", id, card(GOOD_CARD));
    adminStatus(id, "PACKED");

    String received = stream.getResponse().getContentAsString();
    assertTrue(received.contains("event:ready"));
    assertTrue(received.contains("event:ORDER_CREATED"), received);
    assertTrue(received.contains(order.get("orderNumber").asText()));
    assertTrue(received.contains("event:ORDER_UPDATED"));
    assertTrue(received.contains("\"status\":\"PACKED\""));
  }

  @Test
  void customersOnlyReceiveTheirOwnOrderEvents() throws Exception {
    MvcResult bobsStream = mvc.perform(get("/orders/stream").header("Authorization", customer("bob")))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.request().asyncStarted()).andReturn();
    MvcResult alicesStream = mvc.perform(get("/orders/stream").header("Authorization", customer("alice")))
        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.request().asyncStarted()).andReturn();

    String number = checkout("alice").get("orderNumber").asText();

    assertTrue(alicesStream.getResponse().getContentAsString().contains(number));
    assertFalse(bobsStream.getResponse().getContentAsString().contains(number), "bob must not see alice's order");
    assertEquals(401, mvc.perform(get("/orders/stream")).andReturn().getResponse().getStatus());
  }

  // ---------- helpers needing the database ----------

  private void backdateExpiry(String orderId) {
    mongoTemplate.updateFirst(Query.query(Criteria.where("_id").is(orderId)), new Update().set("expiresAt", Instant.now().minusSeconds(60)), Order.class);
  }

  @Test
  void aPaidOrderHasNoExpiry() throws Exception {
    String id = placeAndPay("alice").get("id").asText();
    assertNull(orders.findById(id).orElseThrow().getExpiresAt());
  }
}
