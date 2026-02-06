package com.itsa.crm.transactions_service.service;

import com.itsa.crm.transactions_service.dto.CreateTransactionRequest;
import com.itsa.crm.transactions_service.dto.ImportBatchDto;
import com.itsa.crm.transactions_service.dto.ImportTransactionsRequest;
import com.itsa.crm.transactions_service.dto.TransactionDto;
import com.itsa.crm.transactions_service.dto.TransactionKind;
import com.itsa.crm.transactions_service.dto.TransactionStatus;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

@Service
public class TransactionsService {
	private final InMemoryTransactionsStore store;

	public TransactionsService(InMemoryTransactionsStore store) {
		this.store = store;
	}

	public TransactionDto create(CreateTransactionRequest request) {
		return store.create(request);
	}

	public TransactionDto get(String transactionId) {
		return store.get(transactionId);
	}

	public void delete(String transactionId) {
		store.delete(transactionId);
	}

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

	public ImportBatchDto importFromSftp(ImportTransactionsRequest request) {
		return store.importFromMockSftp(request);
	}

	public ImportBatchDto getBatch(String importBatchId) {
		return store.getBatch(importBatchId);
	}
}

