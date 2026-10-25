package com.shoppingkaro.user;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/** One saved delivery address. Always read and written through the owning user's id. */
@Document("addresses")
@CompoundIndex(name = "user_created", def = "{'userId': 1, 'createdAt': 1}")
public class Address {
  public enum Type { HOME, WORK, OTHER }

  @Id
  private String id;

  private String userId;
  private String fullName;
  private String phone;
  private String line1;
  private String line2;
  private String landmark;
  private String city;
  private String state;
  private String pincode;
  private Type type;
  private boolean defaultAddress;
  private Instant createdAt;
  private Instant updatedAt;

  protected Address() {}

  public Address(String id, String userId, Instant now) {
    this.id = id;
    this.userId = userId;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void apply(AddressRequest r) {
    this.fullName = r.fullName().trim();
    this.phone = r.phone().trim();
    this.line1 = r.line1().trim();
    this.line2 = blankToNull(r.line2());
    this.landmark = blankToNull(r.landmark());
    this.city = r.city().trim();
    this.state = r.state().trim();
    this.pincode = r.pincode().trim();
    this.type = r.type() == null ? Type.HOME : r.type();
    this.updatedAt = Instant.now();
  }

  private static String blankToNull(String s) {
    return s == null || s.isBlank() ? null : s.trim();
  }

  public String getId() { return id; }
  public String getUserId() { return userId; }
  public String getFullName() { return fullName; }
  public String getPhone() { return phone; }
  public String getLine1() { return line1; }
  public String getLine2() { return line2; }
  public String getLandmark() { return landmark; }
  public String getCity() { return city; }
  public String getState() { return state; }
  public String getPincode() { return pincode; }
  public Type getType() { return type; }
  public boolean isDefaultAddress() { return defaultAddress; }
  public void setDefaultAddress(boolean value) { this.defaultAddress = value; }
  public Instant getCreatedAt() { return createdAt; }
  public Instant getUpdatedAt() { return updatedAt; }
}
