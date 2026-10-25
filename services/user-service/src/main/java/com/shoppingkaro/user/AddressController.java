package com.shoppingkaro.user;

import com.shoppingkaro.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** A signed-in user's address book. Every call is scoped to the user in the token. */
@RestController
@RequestMapping("/addresses")
public class AddressController {
  private final AddressService service;

  public AddressController(AddressService service) {
    this.service = service;
  }

  @GetMapping
  public List<AddressView> list(@AuthenticationPrincipal Jwt jwt) {
    return service.list(CurrentUser.of(jwt).id());
  }

  @GetMapping("/{id}")
  public AddressView get(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.get(CurrentUser.of(jwt).id(), id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public AddressView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AddressRequest req) {
    return service.create(CurrentUser.of(jwt).id(), req);
  }

  @PutMapping("/{id}")
  public AddressView update(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody AddressRequest req) {
    return service.update(CurrentUser.of(jwt).id(), id, req);
  }

  @PostMapping("/{id}/default")
  public AddressView setDefault(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    return service.setDefault(CurrentUser.of(jwt).id(), id);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
    service.delete(CurrentUser.of(jwt).id(), id);
  }
}
