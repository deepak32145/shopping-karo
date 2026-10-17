package com.shoppingkaro.common;

import org.springframework.http.HttpStatus;

public class AppException extends RuntimeException {
  private final HttpStatus status;
  private final String code;

  public AppException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public static AppException notFound(String what) {
    return new AppException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
  }

  public static AppException badRequest(String msg) {
    return new AppException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", msg);
  }

  public static AppException unauthorized(String msg) {
    return new AppException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", msg);
  }

  public static AppException forbidden(String msg) {
    return new AppException(HttpStatus.FORBIDDEN, "FORBIDDEN", msg);
  }

  public static AppException conflict(String msg) {
    return new AppException(HttpStatus.CONFLICT, "CONFLICT", msg);
  }
}
