package com.scroogebank.crm.client_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private String logServiceUrl;
	private Jwt jwt = new Jwt();
	private VerificationEmail verificationEmail = new VerificationEmail();
	private AccountOpening accountOpening = new AccountOpening();

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

	public AccountOpening getAccountOpening() {
		return accountOpening;
	}

	public void setAccountOpening(AccountOpening accountOpening) {
		this.accountOpening = accountOpening;
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
		private boolean enabled = false;
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

	public static class AccountOpening {
		private Set<String> activeBranches = new LinkedHashSet<>(Set.of("SG-001", "SG-002", "SG-003"));
		private Set<String> allowedCurrencies = new LinkedHashSet<>(Set.of("SGD", "USD"));
		private String defaultUserBranch = "SG-001";
		private boolean adminCanOverrideBranch = true;
		private boolean requireVerifiedClient = false;
		private Map<String, String> userHomeBranchByUserId = new LinkedHashMap<>();
		private Map<String, Set<String>> currencyPolicyByAccountType = new LinkedHashMap<>();
		private Map<String, Set<String>> branchAllowedCurrencies = new LinkedHashMap<>();

		public AccountOpening() {
			currencyPolicyByAccountType.put("Savings", new LinkedHashSet<>(Set.of("SGD")));
			currencyPolicyByAccountType.put("Checking", new LinkedHashSet<>(Set.of("SGD", "USD")));
			currencyPolicyByAccountType.put("Business", new LinkedHashSet<>(Set.of("SGD", "USD")));

			branchAllowedCurrencies.put("SG-001", new LinkedHashSet<>(Set.of("SGD", "USD")));
			branchAllowedCurrencies.put("SG-002", new LinkedHashSet<>(Set.of("SGD")));
			branchAllowedCurrencies.put("SG-003", new LinkedHashSet<>(Set.of("SGD", "USD")));
		}

		public Set<String> getActiveBranches() {
			return activeBranches;
		}

		public void setActiveBranches(Set<String> activeBranches) {
			this.activeBranches = activeBranches;
		}

		public Set<String> getAllowedCurrencies() {
			return allowedCurrencies;
		}

		public void setAllowedCurrencies(Set<String> allowedCurrencies) {
			this.allowedCurrencies = allowedCurrencies;
		}

		public String getDefaultUserBranch() {
			return defaultUserBranch;
		}

		public void setDefaultUserBranch(String defaultUserBranch) {
			this.defaultUserBranch = defaultUserBranch;
		}

		public boolean isAdminCanOverrideBranch() {
			return adminCanOverrideBranch;
		}

		public void setAdminCanOverrideBranch(boolean adminCanOverrideBranch) {
			this.adminCanOverrideBranch = adminCanOverrideBranch;
		}

		public Map<String, String> getUserHomeBranchByUserId() {
			return userHomeBranchByUserId;
		}

		public void setUserHomeBranchByUserId(Map<String, String> userHomeBranchByUserId) {
			this.userHomeBranchByUserId = userHomeBranchByUserId;
		}

		public boolean isRequireVerifiedClient() {
			return requireVerifiedClient;
		}

		public void setRequireVerifiedClient(boolean requireVerifiedClient) {
			this.requireVerifiedClient = requireVerifiedClient;
		}

		public Map<String, Set<String>> getCurrencyPolicyByAccountType() {
			return currencyPolicyByAccountType;
		}

		public void setCurrencyPolicyByAccountType(Map<String, Set<String>> currencyPolicyByAccountType) {
			this.currencyPolicyByAccountType = currencyPolicyByAccountType;
		}

		public Map<String, Set<String>> getBranchAllowedCurrencies() {
			return branchAllowedCurrencies;
		}

		public void setBranchAllowedCurrencies(Map<String, Set<String>> branchAllowedCurrencies) {
			this.branchAllowedCurrencies = branchAllowedCurrencies;
		}
	}
}
