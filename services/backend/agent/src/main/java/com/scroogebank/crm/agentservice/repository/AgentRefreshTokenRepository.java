package com.scroogebank.crm.agentservice.repository;

import com.scroogebank.crm.agentservice.entity.AgentRefreshTokenEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for refresh-token persistence.
 */
public interface AgentRefreshTokenRepository extends JpaRepository<AgentRefreshTokenEntity, Long> {
	Optional<AgentRefreshTokenEntity> findByTokenHash(String tokenHash);

	long deleteByUser_Id(Long userId);
}
