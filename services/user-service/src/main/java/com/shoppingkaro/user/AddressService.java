package com.shoppingkaro.user;

import com.shoppingkaro.common.AppException;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

@Service
public class AddressService {
  static final int MAX_ADDRESSES = 10;

  private final AddressRepository addresses;
  private final MongoTemplate mongo;

  public AddressService(AddressRepository addresses, MongoTemplate mongo) {
    this.addresses = addresses;
    this.mongo = mongo;
  }

  /** Default address first, then oldest first. */
  public List<AddressView> list(String userId) {
    return addresses.findByUserIdOrderByCreatedAtAsc(userId).stream()
        .sorted(Comparator.comparing(Address::isDefaultAddress).reversed())
        .map(AddressView::of)
        .toList();
  }

  public AddressView get(String userId, String id) {
    return AddressView.of(owned(userId, id));
  }

  public AddressView create(String userId, AddressRequest req) {
    long count = addresses.countByUserId(userId);
    if (count >= MAX_ADDRESSES) {
      throw new AppException(org.springframework.http.HttpStatus.BAD_REQUEST, "ADDRESS_LIMIT",
          "You can save up to " + MAX_ADDRESSES + " addresses. Delete one to add another.");
    }
    Address address = new Address(UUID.randomUUID().toString(), userId, Instant.now());
    address.apply(req);
    addresses.save(address);
    if (count == 0 || Boolean.TRUE.equals(req.makeDefault())) {
      makeDefault(userId, address.getId());
    }
    return get(userId, address.getId());
  }

  public AddressView update(String userId, String id, AddressRequest req) {
    Address address = owned(userId, id);
    address.apply(req);
    addresses.save(address);
    if (Boolean.TRUE.equals(req.makeDefault())) {
      makeDefault(userId, id);
    }
    return get(userId, id);
  }

  public AddressView setDefault(String userId, String id) {
    owned(userId, id);
    makeDefault(userId, id);
    return get(userId, id);
  }

  public void delete(String userId, String id) {
    Address address = owned(userId, id);
    addresses.delete(address);
    if (address.isDefaultAddress()) {
      // Hand the default to the most recently added address that is left.
      addresses.findByUserIdOrderByCreatedAtAsc(userId).stream()
          .max(Comparator.comparing(Address::getCreatedAt))
          .ifPresent(next -> makeDefault(userId, next.getId()));
    }
  }

  private Address owned(String userId, String id) {
    return addresses.findByIdAndUserId(id, userId).orElseThrow(() -> AppException.notFound("Address"));
  }

  /** Clears the flag on every other address of this user, then sets it on this one. */
  private void makeDefault(String userId, String id) {
    mongo.updateMulti(Query.query(Criteria.where("userId").is(userId).and("_id").ne(id)), new Update().set("defaultAddress", false), Address.class);
    mongo.updateFirst(Query.query(Criteria.where("userId").is(userId).and("_id").is(id)), new Update().set("defaultAddress", true), Address.class);
  }
}
