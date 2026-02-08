package com.scroogebank.crm.agentservice.dto;

import com.scroogebank.crm.agentservice.api.Pagination;
import java.util.List;

/**
 * Paginated list response for users.
 *
 * @param data list of users in the current page
 * @param pagination pagination metadata
 */
public record UsersListResponse(
	List<UserDto> data,
	Pagination pagination
) {}
