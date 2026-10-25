package com.shoppingkaro.auth.token;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface RefreshTokenRepository extends MongoRepository<RefreshTokenDocument, String> {
  long deleteByTokenHash(String tokenHash);

  long deleteByUserId(String userId);
}
