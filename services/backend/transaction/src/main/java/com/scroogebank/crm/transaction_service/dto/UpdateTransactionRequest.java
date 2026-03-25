package com.scroogebank.crm.transaction_service.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Request payload for updating an existing transaction.
 */
public record UpdateTransactionRequest(
	@Size(min = 1, max = 128)
	String clientId,

	TransactionKind transaction,

	@DecimalMin("0")
	BigDecimal amount,

	LocalDate date,

	TransactionStatus status
) {}

