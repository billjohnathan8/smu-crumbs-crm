package com.scroogebank.crm.client_service.repository;

import com.scroogebank.crm.client_service.entity.ClientEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Persistence operations for client entities with search helpers.
 */
public interface ClientRepository extends JpaRepository<ClientEntity, Long> {
	boolean existsByEmailAddressIgnoreCase(String emailAddress);

	boolean existsByPhoneNumber(String phoneNumber);

	boolean existsByEmailAddressIgnoreCaseAndIdNot(String emailAddress, Long id);

	boolean existsByPhoneNumberAndIdNot(String phoneNumber, Long id);

	Optional<ClientEntity> findById(Long id);

	/**
	 * Returns clients assigned to a specific user, ordered by id.
	 *
	 * @param userId user identifier
	 * @return clients assigned to the user
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.assignedUserId = :userId
		ORDER BY c.id
		""")
	List<ClientEntity> findByAssignedAgentId(@Param("userId") String userId);

	/**
	 * Searches all clients using a loose match over name/email/phone.
	 *
	 * @param q search query (nullable)
	 * @return matching clients ordered by id
	 */
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

	/**
	 * Searches clients for a specific user using a loose match over name/email/phone.
	 *
	 * @param userId user identifier
	 * @param q search query (nullable)
	 * @return matching clients ordered by id
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.assignedUserId = :userId AND
			(:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
		ORDER BY c.id
		""")
	List<ClientEntity> searchByAgent(@Param("userId") String userId, @Param("q") String q);
}
