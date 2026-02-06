package com.itsa.crm.clients_service.repository;

import com.itsa.crm.clients_service.entity.ClientEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientRepository extends JpaRepository<ClientEntity, Long> {
	boolean existsByEmailAddressIgnoreCase(String emailAddress);

	boolean existsByPhoneNumber(String phoneNumber);

	boolean existsByEmailAddressIgnoreCaseAndIdNot(String emailAddress, Long id);

	boolean existsByPhoneNumberAndIdNot(String phoneNumber, Long id);

	Optional<ClientEntity> findById(Long id);

	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.assignedAgentId = :agentId
		ORDER BY c.id
		""")
	List<ClientEntity> findByAssignedAgentId(@Param("agentId") String agentId);

	@Query("""
		SELECT c FROM ClientEntity c
		WHERE (:q IS NULL OR :q = '' OR
			LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
			LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
			LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
			c.phoneNumber LIKE CONCAT('%', :q, '%')
		)
		ORDER BY c.id
		""")
	List<ClientEntity> searchAll(@Param("q") String q);

	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.assignedAgentId = :agentId AND
			(:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
		ORDER BY c.id
		""")
	List<ClientEntity> searchByAgent(@Param("agentId") String agentId, @Param("q") String q);
}
