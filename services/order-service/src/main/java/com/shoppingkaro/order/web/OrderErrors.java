package com.shoppingkaro.order.web;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Two people changing the same order at the same instant: the loser is told to look again, not given a 500. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class OrderErrors {
  @ExceptionHandler(OptimisticLockingFailureException.class)
  public ProblemDetail concurrentUpdate(OptimisticLockingFailureException e) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "This order was just changed by someone else. Refresh and try again.");
    pd.setProperty("code", "CONCURRENT_UPDATE");
    return pd;
  }
}
