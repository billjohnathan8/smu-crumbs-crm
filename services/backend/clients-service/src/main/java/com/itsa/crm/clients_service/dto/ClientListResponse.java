package com.itsa.crm.clients_service.dto;

import com.itsa.crm.clients_service.api.Pagination;
import java.util.List;

public record ClientListResponse(
	List<ClientDto> data,
	Pagination pagination
) {}

