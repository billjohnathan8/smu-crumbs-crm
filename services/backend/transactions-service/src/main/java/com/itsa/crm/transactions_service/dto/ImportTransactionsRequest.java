package com.itsa.crm.transactions_service.dto;

public record ImportTransactionsRequest(
	String clientId,
	String sourcePath
) {}

