package com.itsa.crm.clients_service.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record AccountDto(
	String accountId,
	String clientId,
	AccountType accountType,
	AccountStatus accountStatus,
	LocalDate openingDate,
	BigDecimal initialDeposit,
	String currency,
	String branchId,
	Instant createdAt
) {}

