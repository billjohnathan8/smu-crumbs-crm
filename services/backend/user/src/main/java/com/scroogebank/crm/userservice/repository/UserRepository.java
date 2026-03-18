package com.scroogebank.crm.userservice.repository;

import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.entity.UserEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for users.
 */
public interface UserRepository extends JpaRepository<UserEntity, Long> {
	Optional<UserEntity> findByEmail(String email);

	boolean existsByEmailAndIdNot(String email, Long id);

	long countByRole(UserRole role);
}
