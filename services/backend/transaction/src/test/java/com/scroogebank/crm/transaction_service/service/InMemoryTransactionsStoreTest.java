package com.scroogebank.crm.transaction_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.scroogebank.crm.transaction_service.dto.CreateTransactionRequest;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.dto.TransactionDto;
import com.scroogebank.crm.transaction_service.dto.TransactionKind;
import com.scroogebank.crm.transaction_service.dto.TransactionStatus;
import com.scroogebank.crm.transaction_service.exception.ImportBatchNotFoundException;
import com.scroogebank.crm.transaction_service.exception.TransactionNotFoundException;
import com.scroogebank.crm.transaction_service.service.imports.S3BackedTransactionFileSource;
import com.scroogebank.crm.transaction_service.service.imports.TransactionCsvParser;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Validates transaction storage behavior and CSV import logic.
 */
class InMemoryTransactionsStoreTest {
	@TempDir
	Path tempDir;

	private InMemoryTransactionsStore store;

	private void setUp() {
		store = new InMemoryTransactionsStore(
			Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC),
			new S3BackedTransactionFileSource(tempDir),
			new TransactionCsvParser()
		);
	}

	@Test
	void createGetDelete_roundTripAndMissingThrows() {
		setUp();
		TransactionDto created = store.create(new CreateTransactionRequest(
			"clt_1",
			TransactionKind.D,
			new BigDecimal("1200.50"),
			LocalDate.parse("2026-01-01"),
			TransactionStatus.Completed
		));
		assertEquals("txn_1", created.id());

		TransactionDto loaded = store.get("txn_1");
		assertEquals("clt_1", loaded.clientId());
		assertEquals(TransactionKind.D, loaded.transaction());

		store.delete("txn_1");
		TransactionNotFoundException getException = assertThrows(TransactionNotFoundException.class, () -> store.get("txn_1"));
		TransactionNotFoundException deleteException = assertThrows(TransactionNotFoundException.class, () -> store.delete("txn_1"));
		assertNotNull(getException);
		assertNotNull(deleteException);
	}

	@Test
	void list_appliesFiltersAndPaginationBounds() {
		setUp();
		store.create(new CreateTransactionRequest("clt_1", TransactionKind.D, new BigDecimal("10"), LocalDate.parse("2026-01-01"), TransactionStatus.Completed));
		store.create(new CreateTransactionRequest("clt_1", TransactionKind.W, new BigDecimal("20"), LocalDate.parse("2026-01-02"), TransactionStatus.Pending));
		store.create(new CreateTransactionRequest("clt_2", TransactionKind.D, new BigDecimal("30"), LocalDate.parse("2026-01-03"), TransactionStatus.Failed));

		InMemoryTransactionsStore.ListResult filtered = store.list(
			0,
			-3,
			"clt_1",
			TransactionStatus.Pending,
			TransactionKind.W,
			LocalDate.parse("2026-01-01"),
			LocalDate.parse("2026-01-31")
		);

		assertEquals(1, filtered.total());
		assertEquals(1, filtered.data().size());
		assertEquals("clt_1", filtered.data().get(0).clientId());
		assertEquals(TransactionStatus.Pending, filtered.data().get(0).status());

		InMemoryTransactionsStore.ListResult paged = store.list(1, 1, null, null, null, null, null);
		assertEquals(3, paged.total());
		assertEquals(1, paged.data().size());
		assertEquals("txn_2", paged.data().get(0).id());
	}

	@Test
	void importTransactions_countsImportedFailedAndFilteredRecords() throws IOException {
		setUp();
		Path csv = tempDir.resolve("transactions.csv");
		Files.writeString(csv, """
			clientId,transaction,amount,date,status
			clt_1,D,100.00,2026-01-01,Completed

			clt_2,W,50.00,2026-01-02,Pending
			clt_1,X,10.00,2026-01-03,Completed
			clt_1,D,notanumber,2026-01-04,Completed
			""");

		ImportBatchDto batch = store.importTransactions(new ImportTransactionsRequest("clt_1", "transactions.csv"));

		assertEquals(ImportBatchStatus.completed, batch.status());
		assertEquals(4, batch.totalRecords());
		assertEquals(1, batch.importedRecords());
		assertEquals(2, batch.failedRecords());

		TransactionDto imported = store.get("txn_1");
		assertNotNull(imported.importBatchId());
		assertEquals("imp_1", imported.importBatchId());
	}

	@Test
	void importTransactions_missingSourceMarksBatchFailed() {
		setUp();
		ImportBatchDto batch = store.importTransactions(new ImportTransactionsRequest(null, "missing.csv"));

		assertEquals(ImportBatchStatus.failed, batch.status());
		assertEquals(0, batch.totalRecords());
		assertEquals("failed to read source", batch.errorMessage());
	}

	@Test
	void importTransactions_reImportDoesNotCreateDuplicates() throws IOException {
		setUp();
		Path csv = tempDir.resolve("transactions.csv");
		Files.writeString(csv, """
			clientId,transaction,amount,date,status
			clt_1,D,100.00,2026-01-01,Completed
			clt_1,W,30.00,2026-01-02,Pending
			""");

		ImportBatchDto firstBatch = store.importTransactions(new ImportTransactionsRequest(null, "transactions.csv"));
		ImportBatchDto secondBatch = store.importTransactions(new ImportTransactionsRequest(null, "transactions.csv"));
		InMemoryTransactionsStore.ListResult allTransactions = store.list(50, 0, null, null, null, null, null);

		assertEquals(2, firstBatch.importedRecords());
		assertEquals(0, secondBatch.importedRecords());
		assertEquals(2, allTransactions.total());
	}

	@Test
	void getBatch_missingBatchThrowsNotFound() {
		setUp();
		ImportBatchNotFoundException exception = assertThrows(ImportBatchNotFoundException.class, () -> store.getBatch("imp_999"));
		assertNotNull(exception);
	}
}

