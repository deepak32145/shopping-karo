package com.shoppingkaro.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** What the client sends to create or replace an address. */
public record AddressRequest(
    @NotBlank @Size(min = 2, max = 80) String fullName,
    @NotBlank @Pattern(regexp = "^[6-9]\\d{9}$", message = "must be a 10-digit Indian mobile number") String phone,
    @NotBlank @Size(min = 3, max = 120) String line1,
    @Size(max = 120) String line2,
    @Size(max = 80) String landmark,
    @NotBlank @Size(min = 2, max = 60) String city,
    @NotBlank @Size(min = 2, max = 40) String state,
    @NotBlank @Pattern(regexp = "^[1-9]\\d{5}$", message = "must be a 6-digit pincode") String pincode,
    Address.Type type,
    /** Make this the default address. The very first address is always the default. */
    Boolean makeDefault) {}
