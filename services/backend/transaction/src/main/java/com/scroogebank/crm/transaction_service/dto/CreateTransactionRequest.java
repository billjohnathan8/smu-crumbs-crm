package com.scroogebank.crm.transaction_service.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Request payload for creating a transaction.
 */
public record CreateTransactionRequest(
	@NotBlank
	@Size(max = 128)
	@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$")
	String clientId,

	@NotNull
	TransactionKind transaction,

	@NotNull
	@DecimalMin("0")
	BigDecimal amount,

	@NotNull
	LocalDate date,

	@NotNull
	TransactionStatus status
) {}

