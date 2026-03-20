package com.scroogebank.crm.transaction_service.service.imports;

import java.io.IOException;
import java.io.Reader;
import java.util.List;

/**
 * Abstraction for reading transaction CSV files from the configured source.
 *
 * <p>Official ingestion contract: filesystem mock files for local development
 * and S3-backed mock ingestion for deployed environments. No real SFTP network
 * client is supported by this service.
 */
public interface TransactionFileSource {
	List<String> listCsvFiles(String remoteDir) throws IOException;

	Reader openCsvFile(String remotePath) throws IOException;
}
