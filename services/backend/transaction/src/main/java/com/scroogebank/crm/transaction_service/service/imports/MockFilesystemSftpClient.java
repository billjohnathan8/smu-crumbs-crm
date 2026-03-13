package com.scroogebank.crm.transaction_service.service.imports;

import java.nio.file.Path;

import com.scroogebank.crm.transaction_service.config.AppProperties;

import software.amazon.awssdk.services.s3.S3Client;

/**
 * @deprecated Renamed to {@link S3BackedTransactionFileSource}. This file will be removed in a future cleanup.
 */
@Deprecated
public class MockFilesystemSftpClient extends S3BackedTransactionFileSource {
@Deprecated
public MockFilesystemSftpClient(AppProperties appProperties) {
super(appProperties);
}

@Deprecated
public MockFilesystemSftpClient(Path root) {
super(root);
}

@Deprecated
public MockFilesystemSftpClient(Path root, AppProperties.ImportS3 importS3, S3Client s3Client) {
super(root, importS3, s3Client);
}
}

