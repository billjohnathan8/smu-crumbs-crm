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

	List<UserEntity> findAllByStatusNot(UserStatus status, Sort sort);

	List<UserEntity> findAllByStatusNotAndRole(UserStatus status, UserRole role, Sort sort);

	long countByStatusNot(UserStatus status);

	long countByStatusNotAndRole(UserStatus status, UserRole role);

	List<UserEntity> findAllByStatus(UserStatus status, Sort sort);

	List<UserEntity> findAllByStatusAndRole(UserStatus status, UserRole role, Sort sort);

	List<UserEntity> findAllByStatusAndArchivedBy(UserStatus status, Long archivedBy, Sort sort);

	List<UserEntity> findAllByStatusAndRoleAndArchivedBy(UserStatus status, UserRole role, Long archivedBy, Sort sort);

	long countByStatus(UserStatus status);

	long countByStatusAndRole(UserStatus status, UserRole role);

	long countByStatusAndArchivedBy(UserStatus status, Long archivedBy);

	long countByStatusAndRoleAndArchivedBy(UserStatus status, UserRole role, Long archivedBy);
}
