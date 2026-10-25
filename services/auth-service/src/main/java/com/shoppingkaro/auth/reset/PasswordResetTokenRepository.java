package com.shoppingkaro.auth.reset;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface PasswordResetTokenRepository extends MongoRepository<PasswordResetTokenDocument, String> {
  Optional<PasswordResetTokenDocument> findByTokenHash(String tokenHash);

  long deleteByUserId(String userId);
}
