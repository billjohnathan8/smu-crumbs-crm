package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Request payload for creating a new account for a client.
 */
public record AccountCreateRequest(
	@NotBlank
	String clientId,

	@NotNull
	AccountType accountType,

	@NotNull
	AccountStatus accountStatus,

	@NotNull
	LocalDate openingDate,

	@NotNull
	@Min(0)
	BigDecimal initialDeposit,

	@NotBlank
	String currency,

	@NotBlank
	String branchId
) {}
