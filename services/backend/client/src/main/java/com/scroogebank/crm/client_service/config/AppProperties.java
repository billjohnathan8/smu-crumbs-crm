package com.scroogebank.crm.client_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private String logServiceUrl;
	private Jwt jwt = new Jwt();
	private VerificationEmail verificationEmail = new VerificationEmail();

	public String getLogServiceUrl() {
		return logServiceUrl;
	}

	public void setLogServiceUrl(String logServiceUrl) {
		this.logServiceUrl = logServiceUrl;
	}

	public Jwt getJwt() {
		return jwt;
	}

	public void setJwt(Jwt jwt) {
		this.jwt = jwt;
	}

	public VerificationEmail getVerificationEmail() {
		return verificationEmail;
	}

	public void setVerificationEmail(VerificationEmail verificationEmail) {
		this.verificationEmail = verificationEmail;
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

	public static class VerificationEmail {
		private String provider = "mock";
		private String senderEmail;
		private String awsRegion;
		private String awsEndpointUrl;
		private Dispatch dispatch = new Dispatch();

		public String getProvider() {
			return provider;
		}

		public void setProvider(String provider) {
			this.provider = provider;
		}

		public String getSenderEmail() {
			return senderEmail;
		}

		public void setSenderEmail(String senderEmail) {
			this.senderEmail = senderEmail;
		}

		public String getAwsRegion() {
			return awsRegion;
		}

		public void setAwsRegion(String awsRegion) {
			this.awsRegion = awsRegion;
		}

		public String getAwsEndpointUrl() {
			return awsEndpointUrl;
		}

		public void setAwsEndpointUrl(String awsEndpointUrl) {
			this.awsEndpointUrl = awsEndpointUrl;
		}

		public Dispatch getDispatch() {
			return dispatch;
		}

		public void setDispatch(Dispatch dispatch) {
			this.dispatch = dispatch;
		}
	}

	public static class Dispatch {
		private boolean enabled = true;
		private long pollIntervalMs = 30000;
		private int maxBatchSize = 50;
		private int maxAttempts = 5;
		private long baseBackoffSeconds = 30;
		private long serviceTokenTtlSeconds = 300;
		private String serviceUserId = "usr_system_verification";

		public boolean isEnabled() {
			return enabled;
		}

		public void setEnabled(boolean enabled) {
			this.enabled = enabled;
		}

		public long getPollIntervalMs() {
			return pollIntervalMs;
		}

		public void setPollIntervalMs(long pollIntervalMs) {
			this.pollIntervalMs = pollIntervalMs;
		}

		public int getMaxBatchSize() {
			return maxBatchSize;
		}

		public void setMaxBatchSize(int maxBatchSize) {
			this.maxBatchSize = maxBatchSize;
		}

		public int getMaxAttempts() {
			return maxAttempts;
		}

		public void setMaxAttempts(int maxAttempts) {
			this.maxAttempts = maxAttempts;
		}

		public long getBaseBackoffSeconds() {
			return baseBackoffSeconds;
		}

		public void setBaseBackoffSeconds(long baseBackoffSeconds) {
			this.baseBackoffSeconds = baseBackoffSeconds;
		}

		public long getServiceTokenTtlSeconds() {
			return serviceTokenTtlSeconds;
		}

		public void setServiceTokenTtlSeconds(long serviceTokenTtlSeconds) {
			this.serviceTokenTtlSeconds = serviceTokenTtlSeconds;
		}

		public String getServiceUserId() {
			return serviceUserId;
		}

		public void setServiceUserId(String serviceUserId) {
			this.serviceUserId = serviceUserId;
		}
	}
}
