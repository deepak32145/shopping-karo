package com.shoppingkaro.auth.otp;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface EmailOtpRepository extends MongoRepository<EmailOtpDocument, String> {
  Optional<EmailOtpDocument> findByUserId(String userId);

  long deleteByUserId(String userId);
}
