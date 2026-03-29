package com.scroogebank.crm.transaction_service.service;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.dto.UpdateTransactionRequest;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

/**
 * Orchestrates transaction operations against the backing store.
 */
@Service
public class TransactionsService {
	private final TransactionsStore store;

	public TransactionsService(TransactionsStore store) {
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
	 * Updates an existing transaction by id.
	 */
	public TransactionDto update(String transactionId, UpdateTransactionRequest request) {
		return store.update(transactionId, request);
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
	 * Imports transactions from the configured source (S3 bucket or local filesystem).
	 */
	public ImportBatchDto importTransactions(ImportTransactionsRequest request) {
		return store.importTransactions(request);
	}

	/**
	 * Retrieves an import batch by id.
	 */
	public ImportBatchDto getBatch(String importBatchId) {
		return store.getBatch(importBatchId);
	}
}

