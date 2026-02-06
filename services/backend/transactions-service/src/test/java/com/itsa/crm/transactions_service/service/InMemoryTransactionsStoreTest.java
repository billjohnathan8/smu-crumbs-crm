package com.itsa.crm.transactions_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.itsa.crm.transactions_service.dto.CreateTransactionRequest;
import com.itsa.crm.transactions_service.dto.ImportBatchDto;
import com.itsa.crm.transactions_service.dto.ImportBatchStatus;
import com.itsa.crm.transactions_service.dto.ImportTransactionsRequest;
import com.itsa.crm.transactions_service.dto.TransactionDto;
import com.itsa.crm.transactions_service.dto.TransactionKind;
import com.itsa.crm.transactions_service.dto.TransactionStatus;
import com.itsa.crm.transactions_service.exception.ImportBatchNotFoundException;
import com.itsa.crm.transactions_service.exception.TransactionNotFoundException;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class InMemoryTransactionsStoreTest {
	@TempDir
	Path tempDir;

	private InMemoryTransactionsStore store;

	@BeforeEach
	void setUp() {
		store = new InMemoryTransactionsStore(
			Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC),
			tempDir.toString()
		);
	}

	@Test
	void createGetDelete_roundTripAndMissingThrows() {
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
		assertThrows(TransactionNotFoundException.class, () -> store.get("txn_1"));
		assertThrows(TransactionNotFoundException.class, () -> store.delete("txn_1"));
	}

	@Test
	void list_appliesFiltersAndPaginationBounds() {
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
	void importFromMockSftp_countsImportedFailedAndFilteredRecords() throws IOException {
		Path csv = tempDir.resolve("transactions.csv");
		Files.writeString(csv, """
			clientId,transaction,amount,date,status
			clt_1,D,100.00,2026-01-01,Completed

			clt_2,W,50.00,2026-01-02,Pending
			clt_1,X,10.00,2026-01-03,Completed
			clt_1,D,notanumber,2026-01-04,Completed
			""");

		ImportBatchDto batch = store.importFromMockSftp(new ImportTransactionsRequest("clt_1", "transactions.csv"));

		assertEquals(ImportBatchStatus.completed, batch.status());
		assertEquals(4, batch.totalRecords());
		assertEquals(1, batch.importedRecords());
		assertEquals(2, batch.failedRecords());

		TransactionDto imported = store.get("txn_1");
		assertNotNull(imported.importBatchId());
		assertEquals("imp_1", imported.importBatchId());
	}

	@Test
	void importFromMockSftp_missingSourceMarksBatchFailed() {
		ImportBatchDto batch = store.importFromMockSftp(new ImportTransactionsRequest(null, "missing.csv"));

		assertEquals(ImportBatchStatus.failed, batch.status());
		assertEquals(0, batch.totalRecords());
		assertEquals("failed to read source", batch.errorMessage());
	}

	@Test
	void getBatch_missingBatchThrowsNotFound() {
		assertThrows(ImportBatchNotFoundException.class, () -> store.getBatch("imp_999"));
	}
}
