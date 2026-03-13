package com.scroogebank.crm.transaction_service.service.imports;

import java.io.IOException;
import java.io.Reader;
import java.util.List;

/**
 * Abstraction for reading transaction CSV files from the configured source.
 *
 * <p>The project's SFTP requirement is intentionally satisfied by an S3-backed
 * mock rather than a real network SFTP client. Implementations read from the
 * local filesystem (for dev) or from an S3 bucket (for deployed environments).
 */
public interface TransactionFileSource {
	List<String> listCsvFiles(String remoteDir) throws IOException;

	Reader openCsvFile(String remotePath) throws IOException;
}
