package com.scroogebank.crm.transaction_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.repository.TransactionImportBatchRepository;
import com.scroogebank.crm.transaction_service.repository.TransactionRecordRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Verifies persisted transaction state survives store recreation.
 */
@SpringBootTest(properties = {"app.transactions-store.type=postgres"})
class PersistentTransactionsStoreTest {
	@Autowired
	private TransactionsStore store;

	@Autowired
	private TransactionRecordRepository transactionRepository;

	@Autowired
	private TransactionImportBatchRepository batchRepository;

	@Autowired
	private Clock clock;

	@BeforeEach
	void setUp() {
		transactionRepository.deleteAll();
		batchRepository.deleteAll();
	}

	@Test
	void transactionPersistsAcrossStoreInstance() {
		TransactionDto created = store.create(
			new CreateTransactionRequest(
				"clt_123",
				TransactionKind.D,
				new BigDecimal("99.50"),
				LocalDate.parse("2026-02-10"),
				TransactionStatus.Completed
			)
		);

		PersistentTransactionsStore recreated = new PersistentTransactionsStore(
			clock,
			"./mock-sftp",
			transactionRepository,
			batchRepository
		);
		TransactionDto loaded = recreated.get(created.id());

		assertEquals(created.id(), loaded.id());
		assertEquals(created.clientId(), loaded.clientId());
		assertEquals(created.transaction(), loaded.transaction());
		assertEquals(0, created.amount().compareTo(loaded.amount()));
		assertEquals(created.date(), loaded.date());
		assertEquals(created.status(), loaded.status());
	}
}
