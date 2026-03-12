package com.scroogebank.crm.transaction_service.service.imports;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import com.scroogebank.crm.transaction_service.dto.ImportBatchDto;
import com.scroogebank.crm.transaction_service.dto.ImportTransactionsRequest;
import com.scroogebank.crm.transaction_service.service.TransactionsService;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically polls the configured SFTP source and imports all visible CSV files.
 */
@Component
@ConditionalOnProperty(name = "app.sftp.poll.enabled", havingValue = "true")
public class TransactionImportScheduler {
	private static final Logger logger = LoggerFactory.getLogger(TransactionImportScheduler.class);
	private final TransactionsService transactionsService;
	private final SftpClient sftpClient;
	private final AppProperties appProperties;
	private final AtomicBoolean inProgress = new AtomicBoolean(false);

	public TransactionImportScheduler(
		TransactionsService transactionsService,
		SftpClient sftpClient,
		AppProperties appProperties
	) {
		this.transactionsService = transactionsService;
		this.sftpClient = sftpClient;
		this.appProperties = appProperties;
	}

	@Scheduled(
		fixedDelayString = "${app.sftp.poll.fixed-delay-ms:300000}",
		initialDelayString = "${app.sftp.poll.initial-delay-ms:10000}"
	)
	public void pollAndImport() {
		if (!inProgress.compareAndSet(false, true)) {
			logger.debug("Skipping transaction import poll because a previous poll is still running");
			return;
		}

		try {
			List<String> files = sftpClient.listCsvFiles(appProperties.getSftp().getRemoteDir());
			if (files.isEmpty()) {
				logger.debug("No CSV files found in remote dir '{}'", appProperties.getSftp().getRemoteDir());
				return;
			}
			for (String file : files) {
				ImportBatchDto batch = transactionsService.importFromSftp(new ImportTransactionsRequest(null, file));
				logger.info(
					"Imported '{}' into batch {} (total={}, imported={}, failed={})",
					file,
					batch.importBatchId(),
					batch.totalRecords(),
					batch.importedRecords(),
					batch.failedRecords()
				);
			}
		}
		catch (IOException ex) {
			logger.error("Failed to list transaction CSV files from mock SFTP source", ex);
		}
		catch (Exception ex) {
			logger.error("Scheduled transaction import failed", ex);
		}
		finally {
			inProgress.set(false);
		}
	}
}
