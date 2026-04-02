package com.scroogebank.crm.user_service.repository;

import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.entity.UserEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for users.
 */
public interface UserRepository extends JpaRepository<UserEntity, Long> {
	Optional<UserEntity> findByEmail(String email);

	boolean existsByEmailAndIdNot(String email, Long id);

	long countByRole(UserRole role);

	List<UserEntity> findByStatusNot(UserStatus status, Sort sort);

	List<UserEntity> findByStatusNotAndRole(UserStatus status, UserRole role, Sort sort);

	long countByStatusNot(UserStatus status);

	long countByStatusNotAndRole(UserStatus status, UserRole role);
}
