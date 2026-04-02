package com.scroogebank.crm.client_service.repository;

import com.scroogebank.crm.client_service.entity.AccountEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Persistence operations for account entities.
 */
public interface AccountRepository extends JpaRepository<AccountEntity, Long> {
	/**
	 * Finds all non-deleted accounts associated with the given client id.
	 *
	 * @param clientId database client id
	 * @return accounts for the client
	 */
	@Query("SELECT a FROM AccountEntity a WHERE a.client.id = :clientId AND a.deleted = false")
	List<AccountEntity> findByClientId(@Param("clientId") Long clientId);

	@Modifying
	@Query("UPDATE AccountEntity a SET a.deleted = true WHERE a.client.id = :clientId")
	int softDeleteByClientId(@Param("clientId") Long clientId);
}
