package com.shoppingkaro.order.clients;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.shoppingkaro.common.AppException;
import com.shoppingkaro.order.OrderProperties;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/** HTTP implementations of the three service clients, with short timeouts so a slow neighbour cannot hang checkout. */
@Configuration
public class HttpClients {
  private static final Logger log = LoggerFactory.getLogger(HttpClients.class);

  private static RestClient client(String baseUrl) {
    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    factory.setReadTimeout(Duration.ofSeconds(8));
    return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
  }

  private static AppException unavailable(String service, RestClientException e) {
    log.error("{} call failed: {}", service, e.getMessage());
    return new AppException(HttpStatus.BAD_GATEWAY, "UPSTREAM_UNAVAILABLE", "The " + service + " is not responding. Please try again in a moment.");
  }

  // ---------- catalog ----------

  @JsonIgnoreProperties(ignoreUnknown = true)
  record CatalogList(List<CatalogClient.Product> items) {}

  @Bean
  CatalogClient catalogClient(OrderProperties props) {
    RestClient http = client(props.catalogUrl());
    String key = props.internalKey() == null ? "" : props.internalKey();
    return new CatalogClient() {
      @Override
      public List<Product> findProducts(Collection<String> ids) {
        if (ids.isEmpty()) return List.of();
        try {
          CatalogList body = http.get().uri(u -> u.path("/products").queryParam("ids", String.join(",", ids)).build()).retrieve().body(CatalogList.class);
          return body == null || body.items() == null ? List.of() : body.items();
        } catch (RestClientException e) {
          throw unavailable("product service", e);
        }
      }

      @Override
      public void reserve(String orderId, List<Line> lines) {
        try {
          http.post().uri("/internal/stock/reserve").header("X-Internal-Key", key)
              .body(Map.of("orderId", orderId, "items", lines)).retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
          if (e.getStatusCode().value() == 409) {
            throw new AppException(HttpStatus.CONFLICT, field(e, "code", "OUT_OF_STOCK"), field(e, "detail", "One of the items is out of stock."));
          }
          throw unavailable("product service", e);
        } catch (RestClientException e) {
          throw unavailable("product service", e);
        }
      }

      @Override
      public void release(String orderId) {
        try {
          http.post().uri("/internal/stock/release").header("X-Internal-Key", key).body(Map.of("orderId", orderId)).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
          throw unavailable("product service", e);
        }
      }
    };
  }

  /** Pulls a field ("detail", "code") out of a problem+json error body. */
  private static String field(RestClientResponseException e, String name, String fallback) {
    try {
      Map<?, ?> body = e.getResponseBodyAs(Map.class);
      Object d = body == null ? null : body.get(name);
      return d == null ? fallback : d.toString();
    } catch (RuntimeException ignored) {
      return fallback;
    }
  }

  // ---------- cart ----------

  @JsonIgnoreProperties(ignoreUnknown = true)
  record CartBody(List<CartClient.Line> lines) {}

  @Bean
  CartClient cartClient(OrderProperties props) {
    RestClient http = client(props.cartUrl());
    return new CartClient() {
      @Override
      public List<Line> get(String bearer) {
        try {
          CartBody body = http.get().uri("/cart").header(HttpHeaders.AUTHORIZATION, bearer).retrieve().body(CartBody.class);
          return body == null || body.lines() == null ? List.of() : body.lines();
        } catch (RestClientException e) {
          throw unavailable("cart service", e);
        }
      }

      @Override
      public void clear(String bearer) {
        try {
          http.delete().uri("/cart").header(HttpHeaders.AUTHORIZATION, bearer).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
          throw unavailable("cart service", e);
        }
      }
    };
  }

  // ---------- addresses ----------

  @JsonIgnoreProperties(ignoreUnknown = true)
  record AddressBody(String id, String fullName, String phone, String line1, String line2, String landmark, String city, String state, String pincode) {}

  @Bean
  AddressClient addressClient(OrderProperties props) {
    RestClient http = client(props.userUrl());
    return (addressId, bearer) -> {
      try {
        AddressBody a = http.get().uri("/addresses/{id}", addressId).header(HttpHeaders.AUTHORIZATION, bearer).retrieve().body(AddressBody.class);
        return Optional.ofNullable(a).map(x -> new AddressClient.Address(x.id(), x.fullName(), x.phone(), x.line1(), x.line2(), x.landmark(), x.city(), x.state(), x.pincode()));
      } catch (RestClientResponseException e) {
        if (e.getStatusCode().value() == 404) return Optional.empty();
        throw unavailable("address service", e);
      } catch (RestClientException e) {
        throw unavailable("address service", e);
      }
    };
  }

}
