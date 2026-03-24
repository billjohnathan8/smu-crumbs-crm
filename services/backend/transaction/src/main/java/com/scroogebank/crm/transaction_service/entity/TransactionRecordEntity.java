package com.scroogebank.crm.transaction_service.entity;

import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * JPA entity for persisted transactions.
 */
@Entity
@Table(name = "transaction_records")
public class TransactionRecordEntity {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "transaction_id")
	private Long id;

	@Column(name = "client_id", nullable = false, length = 128)
	private String clientId;

	@Enumerated(EnumType.STRING)
	@Column(name = "kind", nullable = false, length = 8)
	private TransactionKind kind;

	@Column(name = "amount", nullable = false, precision = 18, scale = 2)
	private BigDecimal amount;

	@Column(name = "date", nullable = false)
	private LocalDate date;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 32)
	private TransactionStatus status;

	@Column(name = "imported_at")
	private Instant importedAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "import_batch_id")
	private TransactionImportBatchEntity importBatch;

	@Column(name = "import_dedupe_key", length = 64)
	private String importDedupeKey;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getClientId() {
		return clientId;
	}

	public void setClientId(String clientId) {
		this.clientId = clientId;
	}

	public TransactionKind getKind() {
		return kind;
	}

	public void setKind(TransactionKind kind) {
		this.kind = kind;
	}

	public BigDecimal getAmount() {
		return amount;
	}

	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}

	public LocalDate getDate() {
		return date;
	}

	public void setDate(LocalDate date) {
		this.date = date;
	}

	public TransactionStatus getStatus() {
		return status;
	}

	public void setStatus(TransactionStatus status) {
		this.status = status;
	}

	public Instant getImportedAt() {
		return importedAt;
	}

	public void setImportedAt(Instant importedAt) {
		this.importedAt = importedAt;
	}

	public TransactionImportBatchEntity getImportBatch() {
		return importBatch;
	}

	public void setImportBatch(TransactionImportBatchEntity importBatch) {
		this.importBatch = importBatch;
	}

	public String getImportDedupeKey() {
		return importDedupeKey;
	}

	public void setImportDedupeKey(String importDedupeKey) {
		this.importDedupeKey = importDedupeKey;
	}
}
