package com.scroogebank.crm.agentservice.repository;

import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.entity.AgentUserEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for agent users.
 */
public interface AgentUserRepository extends JpaRepository<AgentUserEntity, Long> {
	Optional<AgentUserEntity> findByEmail(String email);

	boolean existsByEmailAndIdNot(String email, Long id);

	long countByRole(UserRole role);
}
