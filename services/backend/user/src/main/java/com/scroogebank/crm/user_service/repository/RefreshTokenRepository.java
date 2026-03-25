package com.scroogebank.crm.user_service.repository;

import com.scroogebank.crm.user_service.entity.RefreshTokenEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for refresh-token persistence.
 */
public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, Long> {
	Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);

	long deleteByUser_Id(Long userId);
}
