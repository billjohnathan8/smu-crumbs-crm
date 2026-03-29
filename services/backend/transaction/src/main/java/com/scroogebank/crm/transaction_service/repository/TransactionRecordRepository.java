package com.scroogebank.crm.transaction_service.repository;

import com.scroogebank.crm.transaction_service.entity.TransactionRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for transactions.
 */
public interface TransactionRecordRepository extends JpaRepository<TransactionRecordEntity, Long> {
	boolean existsByImportDedupeKey(String importDedupeKey);
}
