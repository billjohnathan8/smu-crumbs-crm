package com.scroogebank.crm.client_service.repository;

import com.scroogebank.crm.client_service.entity.AccountEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Persistence operations for account entities.
 */
public interface AccountRepository extends JpaRepository<AccountEntity, Long> {
	/**
	 * Finds all accounts associated with the given client id.
	 *
	 * @param clientId database client id
	 * @return accounts for the client
	 */
	List<AccountEntity> findByClientId(Long clientId);
}
