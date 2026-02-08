package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.api.Pagination;
import java.util.List;

/**
 * Response wrapper for client list results.
 */
public record ClientListResponse(
	List<ClientDto> data,
	Pagination pagination
) {}
