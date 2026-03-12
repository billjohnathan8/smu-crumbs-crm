package com.scroogebank.crm.transaction_service.service.imports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportBatchStatus;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

/**
 * Verifies scheduled polling triggers imports for discovered CSV files.
 */
class TransactionImportSchedulerTest {
	@Test
	void pollAndImport_importsAllListedCsvFiles() throws Exception {
		TransactionsService transactionsService = Mockito.mock(TransactionsService.class);
		SftpClient sftpClient = Mockito.mock(SftpClient.class);
		AppProperties appProperties = new AppProperties();
		appProperties.getSftp().setRemoteDir("incoming");

		when(sftpClient.listCsvFiles("incoming")).thenReturn(List.of("incoming/a.csv", "incoming/b.csv"));
		when(transactionsService.importFromSftp(any())).thenReturn(new ImportBatchDto(
			"imp_1",
			ImportBatchStatus.completed,
			null,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:01Z"),
			1,
			1,
			0,
			null
		));

		TransactionImportScheduler scheduler = new TransactionImportScheduler(
			transactionsService,
			sftpClient,
			appProperties
		);
		scheduler.pollAndImport();

		ArgumentCaptor<ImportTransactionsRequest> captor = ArgumentCaptor.forClass(ImportTransactionsRequest.class);
		verify(transactionsService, times(2)).importFromSftp(captor.capture());
		List<ImportTransactionsRequest> requests = captor.getAllValues();
		assertEquals("incoming/a.csv", requests.get(0).sourcePath());
		assertEquals("incoming/b.csv", requests.get(1).sourcePath());
	}
}
