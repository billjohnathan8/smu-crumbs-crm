package com.itsa.crm.transaction_service.service;

import com.itsa.crm.transaction_service.dto.CreateTransactionRequest;
import com.itsa.crm.transaction_service.dto.ImportBatchDto;
import com.itsa.crm.transaction_service.dto.ImportTransactionsRequest;
import com.itsa.crm.transaction_service.dto.TransactionDto;
import com.itsa.crm.transaction_service.dto.TransactionKind;
import com.itsa.crm.transaction_service.dto.TransactionStatus;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

/**
 * Orchestrates transaction operations against the backing store.
 */
@Service
public class TransactionsService {
	private final InMemoryTransactionsStore store;

	public TransactionsService(InMemoryTransactionsStore store) {
		this.store = store;
	}

	/**
	 * Creates a new transaction.
	 */
	public TransactionDto create(CreateTransactionRequest request) {
		return store.create(request);
	}

	/**
	 * Loads a transaction by id.
	 */
	public TransactionDto get(String transactionId) {
		return store.get(transactionId);
	}

	/**
	 * Deletes a transaction by id.
	 */
	public void delete(String transactionId) {
		store.delete(transactionId);
	}

	/**
	 * Lists transactions with filtering and pagination.
	 */
	public InMemoryTransactionsStore.ListResult list(
		int limit,
		int offset,
		String clientId,
		TransactionStatus status,
		TransactionKind kind,
		LocalDate fromDate,
		LocalDate toDate
	) {
		return store.list(limit, offset, clientId, status, kind, fromDate, toDate);
	}

	/**
	 * Imports transactions from the mock SFTP feed.
	 */
	public ImportBatchDto importFromSftp(ImportTransactionsRequest request) {
		return store.importFromMockSftp(request);
	}

	/**
	 * Retrieves an import batch by id.
	 */
	public ImportBatchDto getBatch(String importBatchId) {
		return store.getBatch(importBatchId);
	}
}

