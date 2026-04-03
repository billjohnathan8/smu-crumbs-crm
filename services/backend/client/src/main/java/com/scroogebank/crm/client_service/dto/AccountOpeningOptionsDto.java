package com.scroogebank.crm.client_service.dto;

import java.util.List;
import java.util.Map;

/**
 * Account opening policy options resolved for a specific caller/client.
 */
public record AccountOpeningOptionsDto(
	String clientId,
	String defaultBranchId,
	boolean canOverrideBranch,
	List<String> authorizedBranches,
	List<String> allowedCurrencies,
	Map<String, List<String>> branchAllowedCurrencies,
	Map<String, List<String>> accountTypeAllowedCurrencies
) {}
