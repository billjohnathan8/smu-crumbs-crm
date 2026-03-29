package com.scroogebank.crm.transaction_service.repository;

import com.scroogebank.crm.transaction_service.entity.TransactionImportBatchEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository for transaction import batches.
 */
public interface TransactionImportBatchRepository extends JpaRepository<TransactionImportBatchEntity, Long> {}
