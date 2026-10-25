package com.shoppingkaro.user;

import java.time.Instant;

public record AddressView(
    String id, String fullName, String phone, String line1, String line2, String landmark,
    String city, String state, String pincode, Address.Type type, boolean isDefault, Instant createdAt) {

  public static AddressView of(Address a) {
    return new AddressView(a.getId(), a.getFullName(), a.getPhone(), a.getLine1(), a.getLine2(), a.getLandmark(),
        a.getCity(), a.getState(), a.getPincode(), a.getType(), a.isDefaultAddress(), a.getCreatedAt());
  }
}
