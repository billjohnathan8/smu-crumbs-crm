package com.itsa.crm.transaction_service.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * DTO describing a transaction returned by the API.
 */
public record TransactionDto(
	String id,
	String clientId,
	TransactionKind transaction,
	BigDecimal amount,
	LocalDate date,
	TransactionStatus status,
	Instant importedAt,
	String importBatchId
) {}

