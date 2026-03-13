package com.scroogebank.crm.transaction_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private String clientServiceUrl;
	private Jwt jwt = new Jwt();
	private MockSftp mockSftp = new MockSftp();
	private Sftp sftp = new Sftp();
	private ImportS3 importS3 = new ImportS3();

	public String getClientServiceUrl() {
		return clientServiceUrl;
	}

	public void setClientServiceUrl(String clientServiceUrl) {
		this.clientServiceUrl = clientServiceUrl;
	}

	public Jwt getJwt() {
		return jwt;
	}

	public void setJwt(Jwt jwt) {
		this.jwt = jwt;
	}

	public MockSftp getMockSftp() {
		return mockSftp;
	}

	public void setMockSftp(MockSftp mockSftp) {
		this.mockSftp = mockSftp;
	}

	public Sftp getSftp() {
		return sftp;
	}

	public void setSftp(Sftp sftp) {
		this.sftp = sftp;
	}

	public ImportS3 getImportS3() {
		return importS3;
	}

	public void setImportS3(ImportS3 importS3) {
		this.importS3 = importS3;
	}

	public static class Jwt {
		private String hmacSecret;

		public String getHmacSecret() {
			return hmacSecret;
		}

		public void setHmacSecret(String hmacSecret) {
			this.hmacSecret = hmacSecret;
		}
	}

	public static class MockSftp {
		private String root;

		public String getRoot() {
			return root;
		}

		public void setRoot(String root) {
			this.root = root;
		}
	}

	/**
	 * Ingestion polling config. The {@code app.sftp.*} config prefix is retained
	 * for deployment compatibility; the actual transport is S3-backed (not real SFTP).
	 */
	public static class Sftp {
		private String remoteDir = ".";
		private Poll poll = new Poll();

		public String getRemoteDir() {
			return remoteDir;
		}

		public void setRemoteDir(String remoteDir) {
			this.remoteDir = remoteDir;
		}

		public Poll getPoll() {
			return poll;
		}

		public void setPoll(Poll poll) {
			this.poll = poll;
		}
	}

	public static class Poll {
		private boolean enabled;
		private long fixedDelayMs = 300000;
		private long initialDelayMs = 10000;

		public boolean isEnabled() {
			return enabled;
		}

		public void setEnabled(boolean enabled) {
			this.enabled = enabled;
		}

		public long getFixedDelayMs() {
			return fixedDelayMs;
		}

		public void setFixedDelayMs(long fixedDelayMs) {
			this.fixedDelayMs = fixedDelayMs;
		}

		public long getInitialDelayMs() {
			return initialDelayMs;
		}

		public void setInitialDelayMs(long initialDelayMs) {
			this.initialDelayMs = initialDelayMs;
		}
	}

	public static class ImportS3 {
		private String bucket;
		private String region = "ap-southeast-1";
		private String endpoint;
		private boolean pathStyleAccessEnabled;
		private String accessKeyId;
		private String secretAccessKey;

		public String getBucket() {
			return bucket;
		}

		public void setBucket(String bucket) {
			this.bucket = bucket;
		}

		public String getRegion() {
			return region;
		}

		public void setRegion(String region) {
			this.region = region;
		}

		public String getEndpoint() {
			return endpoint;
		}

		public void setEndpoint(String endpoint) {
			this.endpoint = endpoint;
		}

		public boolean isPathStyleAccessEnabled() {
			return pathStyleAccessEnabled;
		}

		public void setPathStyleAccessEnabled(boolean pathStyleAccessEnabled) {
			this.pathStyleAccessEnabled = pathStyleAccessEnabled;
		}

		public String getAccessKeyId() {
			return accessKeyId;
		}

		public void setAccessKeyId(String accessKeyId) {
			this.accessKeyId = accessKeyId;
		}

		public String getSecretAccessKey() {
			return secretAccessKey;
		}

		public void setSecretAccessKey(String secretAccessKey) {
			this.secretAccessKey = secretAccessKey;
		}
	}
}
