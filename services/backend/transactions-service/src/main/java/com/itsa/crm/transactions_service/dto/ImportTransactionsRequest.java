package com.itsa.crm.transactions_service.dto;

/**
 * Request payload for importing transactions from a mock SFTP source.
 */
public record ImportTransactionsRequest(
	String clientId,
	String sourcePath
) {}
