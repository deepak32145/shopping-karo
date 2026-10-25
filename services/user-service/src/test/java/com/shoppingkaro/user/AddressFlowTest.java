package com.shoppingkaro.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AddressFlowTest {
  @Container
  @ServiceConnection
  static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;

  private static RequestPostProcessor as(String userId) {
    return jwt().jwt(j -> j.subject(userId).claim("email", userId + "@example.com")).authorities(new SimpleGrantedAuthority("ROLE_BUYER"));
  }

  private static String address(String name, String pincode, boolean makeDefault) {
    return "{\"fullName\":\"" + name + "\",\"phone\":\"9876543210\",\"line1\":\"12 MG Road\",\"city\":\"Gurgaon\","
        + "\"state\":\"Haryana\",\"pincode\":\"" + pincode + "\",\"type\":\"HOME\",\"makeDefault\":" + makeDefault + "}";
  }

  private MvcResult send(MockHttpServletRequestBuilder req, String userId, String body) throws Exception {
    if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
    return mvc.perform(req.with(as(userId))).andReturn();
  }

  private JsonNode body(MvcResult r) throws Exception {
    return json.readTree(r.getResponse().getContentAsString());
  }

  @Test
  void requiresSignIn() throws Exception {
    assertEquals(401, mvc.perform(get("/addresses")).andReturn().getResponse().getStatus());
    assertEquals(401, mvc.perform(post("/addresses").contentType(MediaType.APPLICATION_JSON).content(address("Alpha", "122001", false))).andReturn().getResponse().getStatus());
  }

  @Test
  void firstAddressBecomesTheDefaultAndDefaultsMove() throws Exception {
    String u = "user-defaults";
    MvcResult first = send(post("/addresses"), u, address("Home", "122001", false));
    assertEquals(201, first.getResponse().getStatus());
    assertTrue(body(first).get("isDefault").asBoolean(), "first address is the default");

    MvcResult second = send(post("/addresses"), u, address("Office", "110001", false));
    assertFalse(body(second).get("isDefault").asBoolean());

    // asking for default on creation moves it
    MvcResult third = send(post("/addresses"), u, address("Parents", "400001", true));
    assertTrue(body(third).get("isDefault").asBoolean());

    JsonNode list = body(send(get("/addresses"), u, null));
    assertEquals(3, list.size());
    assertEquals("Parents", list.get(0).get("fullName").asText(), "default is listed first");
    long defaults = 0;
    for (JsonNode a : list) if (a.get("isDefault").asBoolean()) defaults++;
    assertEquals(1, defaults, "exactly one default");

    // explicit switch
    String officeId = body(second).get("id").asText();
    assertEquals(200, send(post("/addresses/" + officeId + "/default"), u, null).getResponse().getStatus());
    assertEquals("Office", body(send(get("/addresses"), u, null)).get(0).get("fullName").asText());
  }

  @Test
  void deletingTheDefaultPromotesAnotherAddress() throws Exception {
    String u = "user-delete";
    String a = body(send(post("/addresses"), u, address("Alpha", "122001", false))).get("id").asText();
    send(post("/addresses"), u, address("Bravo", "110001", false));
    assertEquals(204, send(delete("/addresses/" + a), u, null).getResponse().getStatus());
    JsonNode list = body(send(get("/addresses"), u, null));
    assertEquals(1, list.size());
    assertTrue(list.get(0).get("isDefault").asBoolean(), "the remaining address took over as default");
    assertEquals(404, send(get("/addresses/" + a), u, null).getResponse().getStatus());
  }

  @Test
  void updatesAnAddress() throws Exception {
    String u = "user-update";
    String id = body(send(post("/addresses"), u, address("Old name", "122001", false))).get("id").asText();
    MvcResult res = send(put("/addresses/" + id), u, address("New name", "560001", false));
    assertEquals(200, res.getResponse().getStatus());
    assertEquals("New name", body(res).get("fullName").asText());
    assertEquals("560001", body(res).get("pincode").asText());
    assertTrue(body(res).get("isDefault").asBoolean(), "update keeps the default flag");
  }

  @Test
  void usersCannotSeeOrChangeEachOthersAddresses() throws Exception {
    String id = body(send(post("/addresses"), "owner", address("Private", "122001", false))).get("id").asText();
    assertEquals(0, body(send(get("/addresses"), "intruder", null)).size());
    assertEquals(404, send(get("/addresses/" + id), "intruder", null).getResponse().getStatus());
    assertEquals(404, send(put("/addresses/" + id), "intruder", address("Hacked", "122001", false)).getResponse().getStatus());
    assertEquals(404, send(delete("/addresses/" + id), "intruder", null).getResponse().getStatus());
    assertEquals(404, send(post("/addresses/" + id + "/default"), "intruder", null).getResponse().getStatus());
    assertEquals("Private", body(send(get("/addresses/" + id), "owner", null)).get("fullName").asText());
  }

  @Test
  void validatesIndianPhoneAndPincode() throws Exception {
    String badPhone = address("X", "122001", false).replace("9876543210", "1234567890");
    MvcResult res = send(post("/addresses"), "user-validate", badPhone);
    assertEquals(400, res.getResponse().getStatus());
    assertEquals("VALIDATION_FAILED", body(res).get("code").asText());
    assertEquals(400, send(post("/addresses"), "user-validate", address("X", "12345", false)).getResponse().getStatus());
    assertEquals(400, send(post("/addresses"), "user-validate", address("X", "012345", false)).getResponse().getStatus());
    assertEquals(400, send(post("/addresses"), "user-validate", "{not json").getResponse().getStatus());
  }

  @Test
  void capsTheAddressBookAtTen() throws Exception {
    String u = "user-limit";
    for (int i = 0; i < 10; i++) assertEquals(201, send(post("/addresses"), u, address("Addr" + i, "122001", false)).getResponse().getStatus());
    MvcResult eleventh = send(post("/addresses"), u, address("Too many", "122001", false));
    assertEquals(400, eleventh.getResponse().getStatus());
    assertEquals("ADDRESS_LIMIT", body(eleventh).get("code").asText());
  }
}
