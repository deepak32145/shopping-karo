package com.shoppingkaro.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Uniform RFC 7807 error responses for every service that depends on sk-common. */
@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(AppException.class)
  public ProblemDetail handleApp(AppException e) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(e.status(), e.getMessage());
    pd.setProperty("code", e.code());
    return pd;
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ProblemDetail handleValidation(MethodArgumentNotValidException e) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
    pd.setProperty("code", "VALIDATION_FAILED");
    pd.setProperty("errors", e.getBindingResult().getFieldErrors().stream()
        .map(f -> f.getField() + ": " + f.getDefaultMessage()).toList());
    return pd;
  }

  @ExceptionHandler(Exception.class)
  public ProblemDetail handleUnexpected(Exception e) {
    log.error("Unhandled exception", e);
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error");
    pd.setProperty("code", "INTERNAL");
    return pd;
  }
}
