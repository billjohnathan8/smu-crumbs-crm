package com.scroogebank.crm.transaction_service.service;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.dto.UpdateTransactionRequest;
import java.time.LocalDate;

/**
 * Storage abstraction for transaction and import-batch state.
 */
public interface TransactionsStore {
	TransactionDto create(CreateTransactionRequest request);

	TransactionDto get(String transactionId);

	TransactionDto update(String transactionId, UpdateTransactionRequest request);

	void delete(String transactionId);

	InMemoryTransactionsStore.ListResult list(
		int limit,
		int offset,
		String clientId,
		TransactionStatus status,
		TransactionKind kind,
		LocalDate fromDate,
		LocalDate toDate
	);

	ImportBatchDto importTransactions(ImportTransactionsRequest request);

	ImportBatchDto getBatch(String importBatchId);
}
