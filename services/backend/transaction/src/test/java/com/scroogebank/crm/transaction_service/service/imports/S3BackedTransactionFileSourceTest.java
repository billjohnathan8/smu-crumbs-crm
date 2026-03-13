package com.scroogebank.crm.transaction_service.service.imports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * Verifies S3-backed transaction file source filesystem and S3 behaviors.
 */
class S3BackedTransactionFileSourceTest {
	@TempDir
	Path tempDir;

	@Test
	void openCsvFile_readsFromFilesystemBeforeS3Fallback() throws IOException {
		Files.writeString(tempDir.resolve("transactions.csv"), "clientId,transaction,amount,date,status\n");
		S3Client s3Client = Mockito.mock(S3Client.class);
		S3BackedTransactionFileSource client = new S3BackedTransactionFileSource(tempDir, importS3("bucket-a"), s3Client);

		try (var reader = new BufferedReader(client.openCsvFile("transactions.csv"))) {
			assertEquals("clientId,transaction,amount,date,status", reader.readLine());
		}

		verifyNoInteractions(s3Client);
	}

	@Test
	void openCsvFile_readsFromConfiguredS3BucketWhenFilesystemFileMissing() throws IOException {
		S3Client s3Client = Mockito.mock(S3Client.class);
		when(s3Client.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(csvObject("clt_1,D,10,2026-01-01,Completed\n"));
		S3BackedTransactionFileSource client = new S3BackedTransactionFileSource(tempDir, importS3("bucket-a"), s3Client);

		try (var reader = new BufferedReader(client.openCsvFile("incoming/transactions.csv"))) {
			assertEquals("clt_1,D,10,2026-01-01,Completed", reader.readLine());
		}

		ArgumentCaptor<GetObjectRequest> requestCaptor = ArgumentCaptor.forClass(GetObjectRequest.class);
		verify(s3Client).getObjectAsBytes(requestCaptor.capture());
		assertEquals("bucket-a", requestCaptor.getValue().bucket());
		assertEquals("incoming/transactions.csv", requestCaptor.getValue().key());
	}

	@Test
	void openCsvFile_supportsExplicitS3UriSourcePath() throws IOException {
		S3Client s3Client = Mockito.mock(S3Client.class);
		when(s3Client.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(csvObject("clt_2,W,20,2026-01-02,Pending\n"));
		S3BackedTransactionFileSource client = new S3BackedTransactionFileSource(tempDir, importS3("unused-default"), s3Client);

		try (var reader = new BufferedReader(client.openCsvFile("s3://bucket-b/incoming/file.csv"))) {
			assertEquals("clt_2,W,20,2026-01-02,Pending", reader.readLine());
		}

		ArgumentCaptor<GetObjectRequest> requestCaptor = ArgumentCaptor.forClass(GetObjectRequest.class);
		verify(s3Client).getObjectAsBytes(requestCaptor.capture());
		assertEquals("bucket-b", requestCaptor.getValue().bucket());
		assertEquals("incoming/file.csv", requestCaptor.getValue().key());
	}

	@Test
	void listCsvFiles_listsCsvObjectsFromConfiguredS3Bucket() throws IOException {
		S3Client s3Client = Mockito.mock(S3Client.class);
		when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(
			ListObjectsV2Response.builder()
				.contents(
					S3Object.builder().key("incoming/a.csv").build(),
					S3Object.builder().key("incoming/readme.txt").build(),
					S3Object.builder().key("incoming/b.csv").build()
				)
				.isTruncated(false)
				.build()
		);
		S3BackedTransactionFileSource client = new S3BackedTransactionFileSource(tempDir, importS3("bucket-a"), s3Client);

		List<String> files = client.listCsvFiles("incoming");
		assertEquals(List.of("s3://bucket-a/incoming/a.csv", "s3://bucket-a/incoming/b.csv"), files);

		ArgumentCaptor<ListObjectsV2Request> requestCaptor = ArgumentCaptor.forClass(ListObjectsV2Request.class);
		verify(s3Client).listObjectsV2(requestCaptor.capture());
		assertEquals("bucket-a", requestCaptor.getValue().bucket());
		assertEquals("incoming/", requestCaptor.getValue().prefix());
	}

	private static AppProperties.ImportS3 importS3(String bucket) {
		AppProperties.ImportS3 importS3 = new AppProperties.ImportS3();
		importS3.setBucket(bucket);
		importS3.setRegion("ap-southeast-1");
		return importS3;
	}

	private static ResponseBytes<GetObjectResponse> csvObject(String csvContent) {
		return ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), csvContent.getBytes(StandardCharsets.UTF_8));
	}
}
