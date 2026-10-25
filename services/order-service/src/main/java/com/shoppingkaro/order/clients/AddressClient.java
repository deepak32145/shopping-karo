package com.shoppingkaro.order.clients;

import java.util.Optional;

/** user-service: the address book. The user's own token is forwarded, so only their own addresses are visible. */
public interface AddressClient {
  record Address(String id, String fullName, String phone, String line1, String line2, String landmark, String city, String state, String pincode) {}

  Optional<Address> find(String addressId, String bearer);
}
