package com.itsa.crm.clients_service.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

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

