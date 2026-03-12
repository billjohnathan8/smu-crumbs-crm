package com.scroogebank.crm.transaction_service.service.imports;

import com.scroogebank.crm.transaction_service.config.AppProperties;
import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Local filesystem-backed SFTP client used for local/mock ingestion.
 */
@Component
public class MockFilesystemSftpClient implements SftpClient {
	private static final String S3_SCHEME = "s3://";
	private final Path root;
	private final AppProperties.ImportS3 importS3;
	private final S3Client s3Client;

	@Autowired
	public MockFilesystemSftpClient(AppProperties appProperties) {
		this(Path.of(appProperties.getMockSftp().getRoot()), appProperties.getImportS3(), buildS3Client(appProperties.getImportS3()));
	}

	public MockFilesystemSftpClient(Path root) {
		this(root, null, null);
	}

	MockFilesystemSftpClient(Path root, AppProperties.ImportS3 importS3, S3Client s3Client) {
		this.root = root.normalize().toAbsolutePath();
		this.importS3 = importS3;
		this.s3Client = s3Client;
	}

	@Override
	public List<String> listCsvFiles(String remoteDir) throws IOException {
		if (isS3BucketConfigured()) {
			return listS3CsvFiles(remoteDir);
		}
		Path directory = resolveSafe(remoteDir == null || remoteDir.isBlank() ? "." : remoteDir);
		if (!Files.exists(directory) || !Files.isDirectory(directory)) {
			return List.of();
		}
		try (var stream = Files.list(directory)) {
			return stream
				.filter(Files::isRegularFile)
				.filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".csv"))
				.sorted(Comparator.comparing(path -> path.getFileName().toString()))
				.map(this::toRemotePath)
				.toList();
		}
	}

	@Override
	public Reader openCsvFile(String remotePath) throws IOException {
		String normalizedSourcePath = remotePath == null || remotePath.isBlank() ? "transactions.csv" : remotePath;
		S3Location explicitS3Location = parseS3Uri(normalizedSourcePath);
		if (explicitS3Location != null) {
			return openS3CsvFile(explicitS3Location);
		}

		Path resolved = resolveSafe(normalizedSourcePath);
		if (Files.exists(resolved) && Files.isRegularFile(resolved)) {
			return Files.newBufferedReader(resolved, StandardCharsets.UTF_8);
		}

		if (isS3BucketConfigured()) {
			return openS3CsvFile(new S3Location(importS3.getBucket().trim(), normalizeS3Key(normalizedSourcePath)));
		}

		if (!Files.exists(resolved) || !Files.isRegularFile(resolved)) {
			throw new IOException("source file not found");
		}
		return Files.newBufferedReader(resolved, StandardCharsets.UTF_8);
	}

	private List<String> listS3CsvFiles(String remoteDir) throws IOException {
		ensureS3ClientConfigured();
		String bucket = importS3.getBucket().trim();
		String prefix = normalizeS3Prefix(remoteDir);

		try {
			String continuationToken = null;
			List<String> keys = new java.util.ArrayList<>();
			do {
				ListObjectsV2Request request = ListObjectsV2Request.builder()
					.bucket(bucket)
					.prefix(prefix)
					.continuationToken(continuationToken)
					.build();
				ListObjectsV2Response response = s3Client.listObjectsV2(request);
				response.contents().stream()
					.map(item -> item.key())
					.filter(Objects::nonNull)
					.filter(key -> key.toLowerCase(Locale.ROOT).endsWith(".csv"))
					.forEach(keys::add);
				continuationToken = response.isTruncated() ? response.nextContinuationToken() : null;
			}
			while (continuationToken != null && !continuationToken.isBlank());

			return keys.stream()
				.sorted()
				.map(key -> toS3Uri(bucket, key))
				.toList();
		}
		catch (S3Exception ex) {
			throw new IOException("failed to list source files from s3", ex);
		}
	}

	private Reader openS3CsvFile(S3Location location) throws IOException {
		ensureS3ClientConfigured();
		GetObjectRequest request = GetObjectRequest.builder()
			.bucket(location.bucket())
			.key(location.key())
			.build();
		try {
			ResponseBytes<?> objectBytes = s3Client.getObjectAsBytes(request);
			return new StringReader(objectBytes.asString(StandardCharsets.UTF_8));
		}
		catch (NoSuchKeyException ex) {
			throw new IOException("source file not found", ex);
		}
		catch (S3Exception ex) {
			if (ex.statusCode() == 404) {
				throw new IOException("source file not found", ex);
			}
			throw new IOException("failed to read source file from s3", ex);
		}
	}

	private void ensureS3ClientConfigured() throws IOException {
		if (s3Client == null) {
			throw new IOException("s3 client not configured");
		}
	}

	private boolean isS3BucketConfigured() {
		return importS3 != null && importS3.getBucket() != null && !importS3.getBucket().isBlank();
	}

	private String toRemotePath(Path file) {
		String relative = root.relativize(file.toAbsolutePath().normalize()).toString();
		return relative.replace('\\', '/');
	}

	private static String toS3Uri(String bucket, String key) {
		return S3_SCHEME + bucket + "/" + key;
	}

	private static String normalizeS3Prefix(String remoteDir) {
		if (remoteDir == null || remoteDir.isBlank() || ".".equals(remoteDir.trim())) {
			return "";
		}
		String normalized = remoteDir.trim().replace('\\', '/');
		while (normalized.startsWith("/")) {
			normalized = normalized.substring(1);
		}
		if (!normalized.isEmpty() && !normalized.endsWith("/")) {
			normalized = normalized + "/";
		}
		return normalized;
	}

	private static String normalizeS3Key(String sourcePath) throws IOException {
		String key = sourcePath.trim().replace('\\', '/');
		while (key.startsWith("/")) {
			key = key.substring(1);
		}
		if (key.isBlank()) {
			throw new IOException("source path must not be blank");
		}
		return key;
	}

	private static S3Location parseS3Uri(String sourcePath) throws IOException {
		if (sourcePath == null || !sourcePath.startsWith(S3_SCHEME)) {
			return null;
		}
		URI uri;
		try {
			uri = URI.create(sourcePath.trim());
		}
		catch (IllegalArgumentException ex) {
			throw new IOException("invalid s3 source path", ex);
		}
		String bucket = uri.getHost();
		String path = uri.getPath();
		if (bucket == null || bucket.isBlank() || path == null || path.isBlank() || "/".equals(path)) {
			throw new IOException("invalid s3 source path");
		}
		return new S3Location(bucket, normalizeS3Key(path));
	}

	private Path resolveSafe(String remotePath) throws IOException {
		Path candidate = Path.of(remotePath);
		if (candidate.isAbsolute()) {
			throw new IOException("absolute source paths are not allowed");
		}
		Path resolved = root.resolve(candidate).normalize().toAbsolutePath();
		if (!resolved.startsWith(root)) {
			throw new IOException("source path escapes mock SFTP root");
		}
		return resolved;
	}

	private static S3Client buildS3Client(AppProperties.ImportS3 importS3) {
		if (importS3 == null) {
			return null;
		}

		var builder = S3Client.builder()
			.region(Region.of(importS3.getRegion() == null || importS3.getRegion().isBlank() ? "ap-southeast-1" : importS3.getRegion()));

		if (importS3.getEndpoint() != null && !importS3.getEndpoint().isBlank()) {
			builder.endpointOverride(URI.create(importS3.getEndpoint().trim()));
		}
		if (importS3.isPathStyleAccessEnabled()) {
			builder.forcePathStyle(true);
		}
		if (importS3.getAccessKeyId() != null && !importS3.getAccessKeyId().isBlank() &&
			importS3.getSecretAccessKey() != null && !importS3.getSecretAccessKey().isBlank()) {
			builder.credentialsProvider(
				StaticCredentialsProvider.create(
					AwsBasicCredentials.create(importS3.getAccessKeyId().trim(), importS3.getSecretAccessKey().trim())
				)
			);
		}
		else {
			builder.credentialsProvider(DefaultCredentialsProvider.create());
		}
		return builder.build();
	}

	private record S3Location(String bucket, String key) {}
}
