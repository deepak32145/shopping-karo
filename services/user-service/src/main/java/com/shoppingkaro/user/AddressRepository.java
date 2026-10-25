package com.shoppingkaro.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AddressRepository extends MongoRepository<Address, String> {
  List<Address> findByUserIdOrderByCreatedAtAsc(String userId);

  /** Ownership is part of every lookup: someone else's id simply isn't found. */
  Optional<Address> findByIdAndUserId(String id, String userId);

  long countByUserId(String userId);
}
