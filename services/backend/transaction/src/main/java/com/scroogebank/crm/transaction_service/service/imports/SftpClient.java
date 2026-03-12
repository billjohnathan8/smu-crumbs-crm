package com.scroogebank.crm.transaction_service.service.imports;

import java.io.IOException;
import java.io.Reader;
import java.util.List;

/**
 * Abstraction for reading transaction files from an SFTP-like source.
 */
public interface SftpClient {
	List<String> listCsvFiles(String remoteDir) throws IOException;

	Reader openCsvFile(String remotePath) throws IOException;
}
