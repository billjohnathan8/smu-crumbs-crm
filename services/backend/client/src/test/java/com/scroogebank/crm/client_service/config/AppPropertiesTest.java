package com.scroogebank.crm.client_service.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AppPropertiesTest {

	@Test
	void topLevelProperties_roundTrip() {
		AppProperties properties = new AppProperties();

		AppProperties.Jwt jwt = new AppProperties.Jwt();
		jwt.setHmacSecret("secret");

		AppProperties.VerificationEmail verificationEmail = new AppProperties.VerificationEmail();
		verificationEmail.setProvider("ses");
		verificationEmail.setSenderEmail("sender@scroogebank.com");
		verificationEmail.setAwsRegion("ap-southeast-1");
		verificationEmail.setAwsEndpointUrl("http://localhost:4566");

		AppProperties.AccountOpening accountOpening = new AppProperties.AccountOpening();

		properties.setLogServiceUrl("http://log-service");
		properties.setJwt(jwt);
		properties.setVerificationEmail(verificationEmail);
		properties.setAccountOpening(accountOpening);

		assertThat(properties.getLogServiceUrl()).isEqualTo("http://log-service");
		assertThat(properties.getJwt().getHmacSecret()).isEqualTo("secret");
		assertThat(properties.getVerificationEmail().getProvider()).isEqualTo("ses");
		assertThat(properties.getVerificationEmail().getSenderEmail()).isEqualTo("sender@scroogebank.com");
		assertThat(properties.getVerificationEmail().getAwsRegion()).isEqualTo("ap-southeast-1");
		assertThat(properties.getVerificationEmail().getAwsEndpointUrl()).isEqualTo("http://localhost:4566");
		assertThat(properties.getAccountOpening()).isSameAs(accountOpening);
	}

	@Test
	void dispatchProperties_roundTrip() {
		AppProperties.Dispatch dispatch = new AppProperties.Dispatch();

		dispatch.setEnabled(true);
		dispatch.setPollIntervalMs(15000L);
		dispatch.setMaxBatchSize(20);
		dispatch.setMaxAttempts(3);
		dispatch.setBaseBackoffSeconds(10L);
		dispatch.setServiceTokenTtlSeconds(600L);
		dispatch.setServiceUserId("usr_dispatch");

		assertThat(dispatch.isEnabled()).isTrue();
		assertThat(dispatch.getPollIntervalMs()).isEqualTo(15000L);
		assertThat(dispatch.getMaxBatchSize()).isEqualTo(20);
		assertThat(dispatch.getMaxAttempts()).isEqualTo(3);
		assertThat(dispatch.getBaseBackoffSeconds()).isEqualTo(10L);
		assertThat(dispatch.getServiceTokenTtlSeconds()).isEqualTo(600L);
		assertThat(dispatch.getServiceUserId()).isEqualTo("usr_dispatch");
	}

	@Test
	void accountOpening_defaultsAndSetters_roundTrip() {
		AppProperties.AccountOpening opening = new AppProperties.AccountOpening();

		assertThat(opening.getActiveBranches()).contains("SG-001", "SG-002", "SG-003");
		assertThat(opening.getAllowedCurrencies()).contains("SGD", "USD");
		assertThat(opening.getDefaultUserBranch()).isEqualTo("SG-001");
		assertThat(opening.isAdminCanOverrideBranch()).isTrue();
		assertThat(opening.isRequireVerifiedClient()).isFalse();
		assertThat(opening.getCurrencyPolicyByAccountType()).containsKey("Savings");
		assertThat(opening.getBranchAllowedCurrencies()).containsKey("SG-001");

		Set<String> activeBranches = new LinkedHashSet<>(Set.of("SG-010"));
		Set<String> allowedCurrencies = new LinkedHashSet<>(Set.of("EUR"));
		Map<String, String> userHomeBranch = new LinkedHashMap<>();
		userHomeBranch.put("usr_1", "SG-010");
		Map<String, Set<String>> accountTypeCurrencies = new LinkedHashMap<>();
		accountTypeCurrencies.put("Savings", Set.of("EUR"));
		Map<String, Set<String>> branchCurrencies = new LinkedHashMap<>();
		branchCurrencies.put("SG-010", Set.of("EUR"));

		opening.setActiveBranches(activeBranches);
		opening.setAllowedCurrencies(allowedCurrencies);
		opening.setDefaultUserBranch("SG-010");
		opening.setAdminCanOverrideBranch(false);
		opening.setRequireVerifiedClient(true);
		opening.setUserHomeBranchByUserId(userHomeBranch);
		opening.setCurrencyPolicyByAccountType(accountTypeCurrencies);
		opening.setBranchAllowedCurrencies(branchCurrencies);

		assertThat(opening.getActiveBranches()).isEqualTo(activeBranches);
		assertThat(opening.getAllowedCurrencies()).isEqualTo(allowedCurrencies);
		assertThat(opening.getDefaultUserBranch()).isEqualTo("SG-010");
		assertThat(opening.isAdminCanOverrideBranch()).isFalse();
		assertThat(opening.isRequireVerifiedClient()).isTrue();
		assertThat(opening.getUserHomeBranchByUserId()).isEqualTo(userHomeBranch);
		assertThat(opening.getCurrencyPolicyByAccountType()).isEqualTo(accountTypeCurrencies);
		assertThat(opening.getBranchAllowedCurrencies()).isEqualTo(branchCurrencies);
	}

	@Test
	void verificationEmail_dispatchSetterAndGetter_roundTrip() {
		AppProperties.VerificationEmail verificationEmail = new AppProperties.VerificationEmail();
		AppProperties.Dispatch dispatch = new AppProperties.Dispatch();
		dispatch.setEnabled(true);

		verificationEmail.setDispatch(dispatch);

		assertThat(verificationEmail.getDispatch()).isSameAs(dispatch);
		assertThat(verificationEmail.getDispatch().isEnabled()).isTrue();
	}
}
