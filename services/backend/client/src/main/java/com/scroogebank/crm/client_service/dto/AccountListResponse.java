package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.api.Pagination;
import java.util.List;

/**
 * Response wrapper for account list results.
 */
public record AccountListResponse(
	List<AccountDto> data,
	Pagination pagination
) {}
