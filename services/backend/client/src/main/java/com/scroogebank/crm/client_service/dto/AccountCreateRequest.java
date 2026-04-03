package com.scroogebank.crm.client_service.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
	@Pattern(regexp = "^[A-Za-z]{3}$", message = "must be a 3-letter ISO currency code")
	String currency,

	@NotBlank
	@Pattern(regexp = "^[A-Za-z0-9-]{2,40}$", message = "must be 2-40 chars using letters, numbers, and hyphens")
	String branchId
) {}
