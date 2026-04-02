package com.scroogebank.crm.client_service.repository;

import com.scroogebank.crm.client_service.entity.ClientEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Persistence operations for client entities with search helpers.
 */
public interface ClientRepository extends JpaRepository<ClientEntity, Long> {
	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email) AND c.deleted = false")
	boolean existsByEmailAddressIgnoreCase(@Param("email") String emailAddress);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone AND c.deleted = false")
	boolean existsByPhoneNumber(@Param("phone") String phoneNumber);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email) AND c.id <> :id AND c.deleted = false")
	boolean existsByEmailAddressIgnoreCaseAndIdNot(@Param("email") String emailAddress, @Param("id") Long id);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone AND c.id <> :id AND c.deleted = false")
	boolean existsByPhoneNumberAndIdNot(@Param("phone") String phoneNumber, @Param("id") Long id);

	Optional<ClientEntity> findById(Long id);

	/**
	 * Returns clients assigned to a specific user, ordered by id.
	 *
	 * @param userId user identifier
	 * @return clients assigned to the user
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.deleted = false AND c.assignedUserId = :userId
		ORDER BY c.id
		""")
	List<ClientEntity> findByAssignedAgentId(@Param("userId") String userId);

	/**
	 * Bulk reassigns clients from one agent to another.
	 *
	 * @param fromUserId source user identifier
	 * @param toUserId destination user identifier
	 * @return number of updated rows
	 */
	@Modifying
	@Query("""
		UPDATE ClientEntity c
		SET c.assignedUserId = :toUserId
		WHERE c.assignedUserId = :fromUserId AND c.deleted = false
		""")
	int reassignClients(@Param("fromUserId") String fromUserId, @Param("toUserId") String toUserId);

	/**
	 * Searches all clients using a loose match over name/email/phone.
	 *
	 * @param q search query (nullable)
	 * @return matching clients ordered by id
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.deleted = false AND (:q IS NULL OR :q = '' OR
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
		WHERE c.deleted = false AND c.assignedUserId = :userId AND
			(:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
		ORDER BY c.id
		""")
	List<ClientEntity> searchByAgent(@Param("userId") String userId, @Param("q") String q);

	long countByAssignedUserIdAndDeletedFalse(String assignedUserId);
}
