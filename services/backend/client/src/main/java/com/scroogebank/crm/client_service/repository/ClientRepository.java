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
	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email)")
	boolean existsByEmailAddressIgnoreCase(@Param("email") String emailAddress);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone")
	boolean existsByPhoneNumber(@Param("phone") String phoneNumber);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email) AND c.id <> :id")
	boolean existsByEmailAddressIgnoreCaseAndIdNot(@Param("email") String emailAddress, @Param("id") Long id);

	@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone AND c.id <> :id")
	boolean existsByPhoneNumberAndIdNot(@Param("phone") String phoneNumber, @Param("id") Long id);

	@Override
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

	/**
	 * Searches all clients with optional filters for KYC status and assigned agent.
	 *
	 * @param q search query (nullable)
	 * @param kycStatus identity verification status filter (nullable)
	 * @param assignedUserId assigned agent filter (nullable)
	 * @return matching clients ordered by id
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.deleted = false
			AND (:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
			AND (:kycStatus IS NULL OR c.identityVerificationStatus = :kycStatus)
			AND (:assignedUserId IS NULL OR :assignedUserId = '' OR c.assignedUserId = :assignedUserId)
		ORDER BY c.id
		""")
	List<ClientEntity> searchAllWithFilters(
		@Param("q") String q,
		@Param("kycStatus") com.scroogebank.crm.client_service.dto.IdentityVerificationStatus kycStatus,
		@Param("assignedUserId") String assignedUserId
	);

	/**
	 * Searches soft-deleted clients with optional filters for KYC status and assigned agent.
	 *
	 * @param q search query (nullable)
	 * @param kycStatus identity verification status filter (nullable)
	 * @param assignedUserId assigned agent filter (nullable)
	 * @return matching archived clients ordered by id
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.deleted = true
			AND (:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
			AND (:kycStatus IS NULL OR c.identityVerificationStatus = :kycStatus)
			AND (:assignedUserId IS NULL OR :assignedUserId = '' OR c.assignedUserId = :assignedUserId)
		ORDER BY c.id DESC
		""")
	List<ClientEntity> searchDeletedWithFilters(
		@Param("q") String q,
		@Param("kycStatus") com.scroogebank.crm.client_service.dto.IdentityVerificationStatus kycStatus,
		@Param("assignedUserId") String assignedUserId
	);

	/**
	 * Searches clients for a specific user with optional filters for KYC status.
	 *
	 * @param userId user identifier
	 * @param q search query (nullable)
	 * @param kycStatus identity verification status filter (nullable)
	 * @return matching clients ordered by id
	 */
	@Query("""
		SELECT c FROM ClientEntity c
		WHERE c.deleted = false
			AND c.assignedUserId = :userId
			AND (:q IS NULL OR :q = '' OR
				LOWER(c.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR
				LOWER(c.emailAddress) LIKE LOWER(CONCAT('%', :q, '%')) OR
				c.phoneNumber LIKE CONCAT('%', :q, '%')
			)
			AND (:kycStatus IS NULL OR c.identityVerificationStatus = :kycStatus)
		ORDER BY c.id
		""")
	List<ClientEntity> searchByAgentWithFilters(
		@Param("userId") String userId,
		@Param("q") String q,
		@Param("kycStatus") com.scroogebank.crm.client_service.dto.IdentityVerificationStatus kycStatus
	);

	long countByAssignedUserIdAndDeletedFalse(String assignedUserId);

	long countByDeletedFalseAndIdentityVerificationStatus(
		com.scroogebank.crm.client_service.dto.IdentityVerificationStatus status
	);

	long countByAssignedUserIdAndDeletedFalseAndIdentityVerificationStatus(
		String assignedUserId,
		com.scroogebank.crm.client_service.dto.IdentityVerificationStatus status
	);
}
