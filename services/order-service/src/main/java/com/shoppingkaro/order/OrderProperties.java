package com.shoppingkaro.order;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("orders")
public record OrderProperties(
    String catalogUrl,
    String cartUrl,
    String userUrl,
    String internalKey,
    long pendingTtlMinutes,
    long freeShippingThreshold,
    long shippingFee,
    long paymentDelayMs,
    int maxPaymentAttempts) {}
