package com.scroogebank.crm.transaction_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.dto.UpdateTransactionRequest;
import com.scroogebank.crm.transaction_service.repository.TransactionImportBatchRepository;
import com.scroogebank.crm.transaction_service.repository.TransactionRecordRepository;
import com.scroogebank.crm.transaction_service.service.imports.S3BackedTransactionFileSource;
import com.scroogebank.crm.transaction_service.service.imports.TransactionCsvParser;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Verifies persisted transaction state survives store recreation.
 */
@SpringBootTest(properties = {"app.transactions-store.type=postgres"})
class PersistentTransactionsStoreTest {
	@TempDir
	Path tempDir;

	@Autowired
	private TransactionsStore store;

	@Autowired
	private TransactionRecordRepository transactionRepository;

	@Autowired
	private TransactionImportBatchRepository batchRepository;

	@Autowired
	private Clock clock;

	void setUp() {
		transactionRepository.deleteAll();
		batchRepository.deleteAll();
	}

	@Test
	void transactionPersistsAcrossStoreInstance() {
		setUp();
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
			new S3BackedTransactionFileSource(tempDir),
			new TransactionCsvParser(),
			transactionRepository,
			batchRepository,
			appProperties(".")
		);
		TransactionDto loaded = recreated.get(created.id());

		assertEquals(created.id(), loaded.id());
		assertEquals(created.clientId(), loaded.clientId());
		assertEquals(created.transaction(), loaded.transaction());
		assertEquals(0, created.amount().compareTo(loaded.amount()));
		assertEquals(created.date(), loaded.date());
		assertEquals(created.status(), loaded.status());
	}

	@Test
	void importTransactions_reImportDoesNotDuplicateRows() throws IOException {
		setUp();
		Path csv = tempDir.resolve("transactions.csv");
		Files.writeString(csv, """
			clientId,transaction,amount,date,status
			clt_1,D,100.00,2026-01-01,Completed
			clt_1,W,30.00,2026-01-02,Pending
			""");

		PersistentTransactionsStore localStore = new PersistentTransactionsStore(
			clock,
			new S3BackedTransactionFileSource(tempDir),
			new TransactionCsvParser(),
			transactionRepository,
			batchRepository,
			appProperties(".")
		);

		ImportBatchDto first = localStore.importTransactions(new ImportTransactionsRequest(null, "transactions.csv"));
		ImportBatchDto second = localStore.importTransactions(new ImportTransactionsRequest(null, "transactions.csv"));
		InMemoryTransactionsStore.ListResult listResult = localStore.list(50, 0, null, null, null, null, null);

		assertEquals(2, first.importedRecords());
		assertEquals(0, second.importedRecords());
		assertEquals(2, listResult.total());
	}

	@Test
	void importTransactions_blankSourcePathAutoSelectsLatestCsvFromConfiguredSourceDir() throws IOException {
		setUp();
		Files.createDirectories(tempDir.resolve("incoming"));
		Files.writeString(tempDir.resolve("incoming/2026-04-01.csv"), """
			clientId,transaction,amount,date,status
			clt_1,D,100.00,2026-04-01,Completed
			""");
		Files.writeString(tempDir.resolve("incoming/2026-04-02.csv"), """
			clientId,transaction,amount,date,status
			clt_1,W,25.00,2026-04-02,Completed
			""");

		PersistentTransactionsStore localStore = new PersistentTransactionsStore(
			clock,
			new S3BackedTransactionFileSource(tempDir),
			new TransactionCsvParser(),
			transactionRepository,
			batchRepository,
			appProperties("incoming/")
		);

		ImportBatchDto batch = localStore.importTransactions(new ImportTransactionsRequest(null, null));
		InMemoryTransactionsStore.ListResult listResult = localStore.list(50, 0, null, null, null, null, null);

		assertEquals(1, batch.totalRecords());
		assertEquals(1, batch.importedRecords());
		assertEquals(1, listResult.total());
		assertEquals(TransactionKind.W, listResult.data().get(0).transaction());
	}

	@Test
	void update_persistsChangedFields() {
		setUp();
		TransactionDto created = store.create(
			new CreateTransactionRequest(
				"clt_123",
				TransactionKind.D,
				new BigDecimal("99.50"),
				LocalDate.parse("2026-02-10"),
				TransactionStatus.Completed
			)
		);

		TransactionDto updated = store.update(
			created.id(),
			new UpdateTransactionRequest(
				null,
				TransactionKind.W,
				new BigDecimal("120.00"),
				LocalDate.parse("2026-02-11"),
				TransactionStatus.Pending
			)
		);

		assertEquals(created.id(), updated.id());
		assertEquals("clt_123", updated.clientId());
		assertEquals(TransactionKind.W, updated.transaction());
		assertEquals(0, new BigDecimal("120.00").compareTo(updated.amount()));
		assertEquals(LocalDate.parse("2026-02-11"), updated.date());
		assertEquals(TransactionStatus.Pending, updated.status());
	}

	private static AppProperties appProperties(String remoteDir) {
		AppProperties appProperties = new AppProperties();
		AppProperties.Sftp sftp = new AppProperties.Sftp();
		sftp.setRemoteDir(remoteDir);
		appProperties.setSftp(sftp);
		return appProperties;
	}
}
