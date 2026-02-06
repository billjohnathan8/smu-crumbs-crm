package com.itsa.crm.clients_service.dto;

import com.itsa.crm.clients_service.api.Pagination;
import java.util.List;

/**
 * Response wrapper for client list results.
 */
public record ClientListResponse(
	List<ClientDto> data,
	Pagination pagination
) {}
