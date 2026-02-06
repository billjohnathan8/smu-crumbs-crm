package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateTransactionRequest(
	@NotBlank
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
