package com.itsa.crm.transactions_service.dto;

import com.itsa.crm.transactions_service.api.Pagination;
import java.util.List;

/**
 * Response payload for user list endpoints.
 */
public record UsersListResponse(
	List<UserDto> data,
	Pagination pagination
) {}


