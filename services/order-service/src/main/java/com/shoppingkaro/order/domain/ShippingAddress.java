package com.shoppingkaro.order.domain;

/** The delivery address copied onto the order. */
public record ShippingAddress(
    String fullName, String phone, String line1, String line2, String landmark, String city, String state, String pincode) {}
