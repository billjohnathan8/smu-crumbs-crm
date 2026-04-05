package com.scroogebank.crm.transaction_service.repository;

import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.entity.TransactionRecordEntity;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

/**
 * Repository for transactions.
 */
public interface TransactionRecordRepository extends JpaRepository<TransactionRecordEntity, Long> {
	boolean existsByImportDedupeKey(String importDedupeKey);

	@Query(
		"""
		SELECT t
		FROM TransactionRecordEntity t
		WHERE t.deleted = false
		  AND (:clientId IS NULL OR t.clientId = :clientId)
		  AND (:status IS NULL OR t.status = :status)
		  AND (:kind IS NULL OR t.kind = :kind)
		  AND (:fromDate IS NULL OR t.date >= :fromDate)
		  AND (:toDate IS NULL OR t.date <= :toDate)
		ORDER BY t.id ASC
		"""
	)
	List<TransactionRecordEntity> search(
		@Param("clientId") String clientId,
		@Param("status") TransactionStatus status,
		@Param("kind") TransactionKind kind,
		@Param("fromDate") LocalDate fromDate,
		@Param("toDate") LocalDate toDate,
		Pageable pageable
	);

	@Query(
		"""
		SELECT COUNT(t)
		FROM TransactionRecordEntity t
		WHERE t.deleted = false
		  AND (:clientId IS NULL OR t.clientId = :clientId)
		  AND (:status IS NULL OR t.status = :status)
		  AND (:kind IS NULL OR t.kind = :kind)
		  AND (:fromDate IS NULL OR t.date >= :fromDate)
		  AND (:toDate IS NULL OR t.date <= :toDate)
		"""
	)
	long countSearch(
		@Param("clientId") String clientId,
		@Param("status") TransactionStatus status,
		@Param("kind") TransactionKind kind,
		@Param("fromDate") LocalDate fromDate,
		@Param("toDate") LocalDate toDate
	);
}
