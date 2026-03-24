package com.scroogebank.crm.transaction_service.entity;

import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * JPA entity for persisted transaction import batches.
 */
@Entity
@Table(name = "transaction_import_batches")
public class TransactionImportBatchEntity {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "batch_id")
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 32)
	private ImportBatchStatus status;

	@Column(name = "requested_client_id", length = 128)
	private String requestedClientId;

	@Column(name = "requested_at", nullable = false)
	private Instant requestedAt;

	@Column(name = "started_at", nullable = false)
	private Instant startedAt;

	@Column(name = "finished_at")
	private Instant finishedAt;

	@Column(name = "total_records", nullable = false)
	private int totalRecords;

	@Column(name = "imported_records", nullable = false)
	private int importedRecords;

	@Column(name = "failed_records", nullable = false)
	private int failedRecords;

	@Column(name = "error_message", length = 255)
	private String errorMessage;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public ImportBatchStatus getStatus() {
		return status;
	}

	public void setStatus(ImportBatchStatus status) {
		this.status = status;
	}

	public String getRequestedClientId() {
		return requestedClientId;
	}

	public void setRequestedClientId(String requestedClientId) {
		this.requestedClientId = requestedClientId;
	}

	public Instant getRequestedAt() {
		return requestedAt;
	}

	public void setRequestedAt(Instant requestedAt) {
		this.requestedAt = requestedAt;
	}

	public Instant getStartedAt() {
		return startedAt;
	}

	public void setStartedAt(Instant startedAt) {
		this.startedAt = startedAt;
	}

	public Instant getFinishedAt() {
		return finishedAt;
	}

	public void setFinishedAt(Instant finishedAt) {
		this.finishedAt = finishedAt;
	}

	public int getTotalRecords() {
		return totalRecords;
	}

	public void setTotalRecords(int totalRecords) {
		this.totalRecords = totalRecords;
	}

	public int getImportedRecords() {
		return importedRecords;
	}

	public void setImportedRecords(int importedRecords) {
		this.importedRecords = importedRecords;
	}

	public int getFailedRecords() {
		return failedRecords;
	}

	public void setFailedRecords(int failedRecords) {
		this.failedRecords = failedRecords;
	}

	public String getErrorMessage() {
		return errorMessage;
	}

	public void setErrorMessage(String errorMessage) {
		this.errorMessage = errorMessage;
	}
}
